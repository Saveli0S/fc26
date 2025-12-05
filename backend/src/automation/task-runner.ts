import { BrowserManager, LogCallback } from './browser.js';
import { AuthManager } from './auth.js';
import { SBCNavigator } from './sbc.js';
import { SquadBuilder } from './squad-builder.js';
import { ComplexTaskHandler } from './complex-task.js';
import { loadConfig, Task, SquadBuilderRules, TaskType } from '../config/tasks.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  completedRepeats: number;
  totalRepeats: number;
  error?: string;
}

export type TaskStatusCallback = (result: TaskResult) => void;

export class TaskRunner {
  private browserManager: BrowserManager;
  private authManager: AuthManager;
  private sbcNavigator: SBCNavigator;
  private log: LogCallback;
  private onTaskStatus: TaskStatusCallback | null = null;
  private isRunning = false;
  private shouldStop = false;

  constructor(logCallback?: LogCallback, taskStatusCallback?: TaskStatusCallback) {
    this.log = logCallback || ((msg) => console.log(msg));
    this.onTaskStatus = taskStatusCallback || null;
    this.browserManager = new BrowserManager(this.log);
    this.authManager = new AuthManager(this.browserManager, this.log);
    this.sbcNavigator = new SBCNavigator(this.browserManager, this.log);
  }

  private broadcastTaskStatus(result: TaskResult): void {
    if (this.onTaskStatus) {
      this.onTaskStatus(result);
    }
  }

  // Default timeout per task repeat (30 seconds)
  private readonly TASK_TIMEOUT_MS = 30000;

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    this.log('Initializing task runner...');
    await this.browserManager.initialize();
    this.log('Task runner initialized', 'success');
  }

  async login(): Promise<boolean> {
    return await this.authManager.login();
  }

  async runTask(task: Task, rules: SquadBuilderRules): Promise<TaskResult> {
    const result: TaskResult = {
      taskId: task.id,
      status: 'pending',
      completedRepeats: 0,
      totalRepeats: task.repeatCount,
    };

    if (!task.enabled) {
      result.status = 'skipped';
      this.log(`Skipping disabled task: ${task.cardTitle}`);
      return result;
    }

    result.status = 'running';
    this.log(`Starting task: ${task.cardTitle} (${task.repeatCount}x)`, 'info');

    try {
      // Navigate to SBC
      await this.sbcNavigator.navigateToSBC();

      // Select category
      await this.sbcNavigator.selectCategory(task.category);

      // Find and click the card
      const cardFound = await this.sbcNavigator.findAndClickCard(task.cardTitle);
      if (!cardFound) {
        result.status = 'failed';
        result.error = `Card not found: ${task.cardTitle}`;
        return result;
      }

      // Handle complex tasks with separate workflow
      if (task.taskType === TaskType.Complex && task.complexConfig) {
        this.log('Using Complex Task workflow (manual card selection)...', 'info');

        const complexHandler = new ComplexTaskHandler(this.browserManager, this.log);
        const success = await complexHandler.execute(task.complexConfig);

        if (success) {
          result.status = 'completed';
          result.completedRepeats = 1;
          result.totalRepeats = 1;
          this.log('Complex task completed successfully', 'success');
        } else {
          result.status = 'failed';
          result.error = 'Complex task failed - could not add all required cards';
          this.log('Complex task failed', 'error');
        }

        this.broadcastTaskStatus(result);

        // Claim rewards if successful
        if (success) {
          await this.sbcNavigator.clickClaimRewards();
        }

        return result;
      }

      // For daily tasks, try to get repeat count from page
      let repeatCount = task.repeatCount;
      if (task.taskType === 'daily') {
        const pageRepeatCount = await this.sbcNavigator.getRepeatCountFromPage();
        if (pageRepeatCount !== null) {
          if (pageRepeatCount === 0) {
            // Task has 0 repeats available - skip it
            this.log(`Task "${task.cardTitle}" has 0 repeats available - skipping`, 'warning');
            result.status = 'skipped';
            result.totalRepeats = 0;
            result.completedRepeats = 0;
            this.broadcastTaskStatus(result);
            return result;
          }
          repeatCount = pageRepeatCount;
          this.log(`Using repeat count from page: ${repeatCount}`, 'info');
        } else {
          this.log(`Using repeat count from config: ${repeatCount}`, 'info');
        }
      }
      result.totalRepeats = repeatCount;
      // Broadcast updated repeat count
      this.broadcastTaskStatus(result);

      // Execute repeats
      for (let i = 0; i < repeatCount; i++) {
        // Check stop flag frequently
        if (this.checkStop(result)) return result;

        this.log(`=== Repeat ${i + 1}/${repeatCount} ===`, 'info');

        try {
          // Wrap each repeat in a timeout
          await this.withTimeout(
            this.executeRepeat(task, rules, result, i, repeatCount),
            this.TASK_TIMEOUT_MS,
            `Timeout: repeat ${i + 1} took more than ${this.TASK_TIMEOUT_MS / 1000}s`
          );

          result.completedRepeats++;
          this.log(`✓ Completed ${result.completedRepeats}/${result.totalRepeats}`, 'success');
          this.broadcastTaskStatus(result);

          // Navigate back to SBC page after each repeat
          this.log('Navigating back to SBC page...');
          await this.sbcNavigator.navigateToSBC();
          if (this.checkStop(result)) return result;
          await this.browserManager.sleep(1000);

        } catch (repeatError) {
          const errorMsg = repeatError instanceof Error ? repeatError.message : String(repeatError);
          this.log(`✗ Repeat ${i + 1} failed: ${errorMsg}`, 'error');
          result.status = 'failed';
          result.error = errorMsg;
          this.broadcastTaskStatus(result);
          // Skip to next task instead of continuing repeats
          break;
        }
      }

      // Determine final status
      if (result.status !== 'failed') {
        result.status = result.completedRepeats === result.totalRepeats ? 'completed' : 'failed';
        if (result.status === 'failed' && !result.error) {
          result.error = 'Not all repeats completed';
        }
      }
      this.broadcastTaskStatus(result);

    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.log(`Task failed: ${result.error}`, 'error');
      this.broadcastTaskStatus(result);
    }

    // Always navigate to SBC page at end of task
    try {
      await this.sbcNavigator.navigateToSBC();
    } catch {
      // Ignore navigation errors
    }

    return result;
  }

  async runAllTasks(): Promise<TaskResult[]> {
    if (this.isRunning) {
      this.log('Tasks already running!', 'warning');
      return [];
    }

    this.isRunning = true;
    this.shouldStop = false;
    const results: TaskResult[] = [];

    try {
      const config = loadConfig();
      const enabledTasks = config.dailyTasks.filter(t => t.enabled);

      this.log(`Running ${enabledTasks.length} tasks...`, 'info');

      for (const task of enabledTasks) {
        if (this.shouldStop) {
          this.log('Execution stopped by user', 'warning');
          break;
        }

        const result = await this.runTask(task, config.squadBuilderRules);
        results.push(result);

        // Go back to SBC main screen for next task
        await this.sbcNavigator.goBack();
        await this.browserManager.sleep(1000);
      }

      this.log(`Completed ${results.filter(r => r.status === 'completed').length}/${enabledTasks.length} tasks`, 'success');

    } catch (error) {
      this.log(`Error running tasks: ${error}`, 'error');
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  async runSingleTask(taskId: string): Promise<TaskResult | null> {
    const config = loadConfig();
    const task = config.dailyTasks.find(t => t.id === taskId);

    if (!task) {
      this.log(`Task not found: ${taskId}`, 'error');
      return null;
    }

    this.isRunning = true;
    this.shouldStop = false;

    try {
      return await this.runTask(task, config.squadBuilderRules);
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    this.shouldStop = true;
    this.log('⏹ STOP signal sent - stopping after current action...', 'warning');
    // Set isRunning to false after a short delay to allow current action to complete
    setTimeout(() => {
      this.isRunning = false;
    }, 500);
  }

  private checkStop(result: TaskResult): boolean {
    if (this.shouldStop) {
      this.log('Execution stopped by user', 'warning');
      result.status = 'failed';
      result.error = 'Stopped by user';
      this.broadcastTaskStatus(result);
      return true;
    }
    return false;
  }

  private async executeRepeat(task: Task, rules: SquadBuilderRules, result: TaskResult, repeatIndex: number, repeatCount: number): Promise<void> {
    // For repeats after the first one, navigate to card again
    if (repeatIndex > 0) {
      if (this.shouldStop) throw new Error('Stopped by user');

      this.log('Starting next repeat...');
      await this.sbcNavigator.selectCategory(task.category);
      if (this.shouldStop) throw new Error('Stopped by user');

      const cardFound = await this.sbcNavigator.findAndClickCard(task.cardTitle);
      if (this.shouldStop) throw new Error('Stopped by user');
      if (!cardFound) {
        throw new Error(`Card not found: ${task.cardTitle}`);
      }
    }

    if (this.shouldStop) throw new Error('Stopped by user');

    // Check if card is completed (non-repeatable)
    if (await this.sbcNavigator.isCardCompleted()) {
      this.log('Card already completed!', 'success');
      result.completedRepeats = repeatCount;
      return;
    }

    if (this.shouldStop) throw new Error('Stopped by user');

    // Click Use Squad Builder
    let squadBuilderOpened = await this.sbcNavigator.clickUseSquadBuilder();
    if (this.shouldStop) throw new Error('Stopped by user');

    if (!squadBuilderOpened) {
      this.log('Trying to find sub-challenge...', 'warning');
      await this.browserManager.sleep(500);
      if (this.shouldStop) throw new Error('Stopped by user');

      const page = this.browserManager.getPage();
      const challengeSlot = page.locator('.ut-sbc-challenge-table-row-view, [class*="challenge-row"]').first();
      if (await challengeSlot.isVisible({ timeout: 1000 }).catch(() => false)) {
        await challengeSlot.click();
        await this.browserManager.sleep(500);
        if (this.shouldStop) throw new Error('Stopped by user');
        squadBuilderOpened = await this.sbcNavigator.clickUseSquadBuilder();
      }
    }

    if (this.shouldStop) throw new Error('Stopped by user');

    if (!squadBuilderOpened) {
      throw new Error('Could not open squad builder');
    }

    // Create squad builder and parse requirements
    const squadBuilder = new SquadBuilder(this.browserManager, rules, this.log);
    if (this.shouldStop) throw new Error('Stopped by user');

    const requirements = await squadBuilder.parseRequirements();
    if (this.shouldStop) throw new Error('Stopped by user');

    // Build the squad
    const buildSuccess = await squadBuilder.buildSquad(requirements);
    if (this.shouldStop) throw new Error('Stopped by user');

    if (!buildSuccess) {
      throw new Error('Could not meet all requirements');
    }

    if (this.shouldStop) throw new Error('Stopped by user');

    // Exchange players
    const exchangeSuccess = await this.sbcNavigator.clickExchangePlayers();
    if (this.shouldStop) throw new Error('Stopped by user');

    if (!exchangeSuccess) {
      throw new Error('Exchange Players button disabled or not found');
    }

    if (this.shouldStop) throw new Error('Stopped by user');

    // Claim rewards
    await this.sbcNavigator.clickClaimRewards();
    if (this.shouldStop) throw new Error('Stopped by user');
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}
