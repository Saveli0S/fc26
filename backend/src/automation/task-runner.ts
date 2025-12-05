import { BrowserManager, LogCallback } from './browser.js';
import { AuthManager } from './auth.js';
import { SBCNavigator } from './sbc.js';
import { SquadBuilder } from './squad-builder.js';
import { loadConfig, Task, SquadBuilderRules } from '../config/tasks.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  completedRepeats: number;
  totalRepeats: number;
  error?: string;
}

export class TaskRunner {
  private browserManager: BrowserManager;
  private authManager: AuthManager;
  private sbcNavigator: SBCNavigator;
  private log: LogCallback;
  private isRunning = false;
  private shouldStop = false;

  constructor(logCallback?: LogCallback) {
    this.log = logCallback || ((msg) => console.log(msg));
    this.browserManager = new BrowserManager(this.log);
    this.authManager = new AuthManager(this.browserManager, this.log);
    this.sbcNavigator = new SBCNavigator(this.browserManager, this.log);
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

      // Execute repeats
      for (let i = 0; i < task.repeatCount; i++) {
        // Check stop flag frequently
        if (this.shouldStop) {
          this.log('Task stopped by user', 'warning');
          result.status = 'failed';
          result.error = 'Stopped by user';
          return result;
        }

        this.log(`=== Repeat ${i + 1}/${task.repeatCount} ===`, 'info');

        // For repeats after the first one, we're already on SBC page (navigated after claiming rewards)
        if (i > 0) {
          if (this.shouldStop) return result;

          this.log('Starting next repeat...');

          // Select category and find card (we're already on SBC page)
          await this.sbcNavigator.selectCategory(task.category);
          if (this.shouldStop) return result;

          const cardFound = await this.sbcNavigator.findAndClickCard(task.cardTitle);
          if (!cardFound) {
            this.log('Could not find card for repeat', 'error');
            break;
          }
        }

        if (this.shouldStop) return result;

        // Check if card is completed (non-repeatable)
        if (await this.sbcNavigator.isCardCompleted()) {
          this.log('Card completed!', 'success');
          result.completedRepeats = task.repeatCount;
          break;
        }

        // Click Use Squad Builder
        let squadBuilderOpened = await this.sbcNavigator.clickUseSquadBuilder();
        if (!squadBuilderOpened) {
          this.log('Trying to find sub-challenge...', 'warning');
          await this.browserManager.sleep(500);

          const page = this.browserManager.getPage();
          const challengeSlot = page.locator('.ut-sbc-challenge-table-row-view, [class*="challenge-row"]').first();
          if (await challengeSlot.isVisible({ timeout: 1000 }).catch(() => false)) {
            await challengeSlot.click();
            await this.browserManager.sleep(500);
            squadBuilderOpened = await this.sbcNavigator.clickUseSquadBuilder();
          }
        }

        if (this.shouldStop) return result;

        if (!squadBuilderOpened) {
          this.log('Could not open squad builder', 'error');
          break;
        }

        // Create squad builder and parse requirements
        const squadBuilder = new SquadBuilder(this.browserManager, rules, this.log);
        const requirements = await squadBuilder.parseRequirements();

        if (this.shouldStop) return result;

        // Build the squad
        const buildSuccess = await squadBuilder.buildSquad(requirements);
        if (!buildSuccess) {
          this.log('Failed to build valid squad', 'error');
          result.status = 'failed';
          result.error = 'Could not meet all requirements';
          return result;
        }

        if (this.shouldStop) return result;

        // Exchange players
        const exchangeSuccess = await this.sbcNavigator.clickExchangePlayers();
        if (!exchangeSuccess) {
          this.log('Failed to exchange players', 'error');
          break;
        }

        if (this.shouldStop) return result;

        // Claim rewards
        await this.sbcNavigator.clickClaimRewards();

        result.completedRepeats++;
        this.log(`Completed ${result.completedRepeats}/${task.repeatCount}`, 'success');

        // Always navigate back to SBC page after each repeat
        this.log('Navigating back to SBC page...');
        await this.sbcNavigator.navigateToSBC();
        await this.browserManager.sleep(1000);
      }

      result.status = result.completedRepeats === task.repeatCount ? 'completed' : 'failed';

    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.log(`Task failed: ${result.error}`, 'error');
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
    this.isRunning = false;
    this.log('STOP signal sent - stopping after current action...', 'warning');
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}
