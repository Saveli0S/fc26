import { BrowserManager, LogCallback } from './browser.js';
import { AuthManager } from './auth.js';
import { SBCNavigator } from './sbc.js';
import { SquadBuilder } from './squad-builder.js';
import { ComplexTaskHandler } from './complex-task.js';
import { UIHelper, EA_SELECTORS } from './ui-helpers.js';
import { loadConfig, Task, SquadBuilderRules, TaskType } from '../config/tasks.js';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  completedRepeats: number;
  totalRepeats: number;
  error?: string;
}

export type TaskStatusCallback = (result: TaskResult) => void;

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  TIMEOUTS: {
    TASK_REPEAT: 30000, // 30 seconds per repeat
  },
  DELAYS: {
    AFTER_NAVIGATION: 1000,
    AFTER_CLEAR_SQUAD: 15000,
    AFTER_CLICK: 1000,
  },
  SELECTORS: {
    CHALLENGE_ROW: '.ut-sbc-challenge-table-row-view, [class*="challenge-row"]',
    EMPTY_SLOT: 'div.ut-item-loading.empty, div.item.empty.droppable',
  },
};

// ============================================================================
// TaskRunner Class
// ============================================================================

export class TaskRunner {
  private browserManager: BrowserManager;
  private authManager: AuthManager;
  private sbcNavigator: SBCNavigator;
  private ui: UIHelper | null = null;
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

  // ==========================================================================
  // Public API - Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    this.log('Initializing task runner...');
    await this.browserManager.initialize();
    this.ui = new UIHelper(this.browserManager, this.log);
    this.log('Task runner initialized', 'success');
  }

  async login(email?: string, password?: string): Promise<boolean> {
    return await this.authManager.login(email, password);
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  // ==========================================================================
  // Public API - Task Execution
  // ==========================================================================

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

        await this.sbcNavigator.goBack();
        await this.sleep(CONFIG.DELAYS.AFTER_NAVIGATION);
      }

      const completed = results.filter(r => r.status === 'completed').length;
      this.log(`Completed ${completed}/${enabledTasks.length} tasks`, 'success');

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
    setTimeout(() => { this.isRunning = false; }, 500);
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  // ==========================================================================
  // Main Task Router
  // ==========================================================================

  private async runTask(task: Task, rules: SquadBuilderRules): Promise<TaskResult> {
    const result = this.createResult(task);

    if (!task.enabled) {
      result.status = 'skipped';
      this.log(`Skipping disabled task: ${task.cardTitle}`);
      return result;
    }

    result.status = 'running';
    this.log(`Starting task: ${task.cardTitle}`, 'info');

    try {
      // Navigate to the SBC card
      await this.navigateToCard(task);

      // Route to appropriate workflow based on task type
      if (task.taskType === TaskType.Complex && task.complexConfig) {
        await this.runComplexTask(task, result);
      } else {
        await this.runRegularTask(task, rules, result);
      }

    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.log(`Task failed: ${result.error}`, 'error');
    }

    this.broadcastTaskStatus(result);
    await this.navigateToSBCSafe();

    return result;
  }

  // ==========================================================================
  // Complex Task Workflow (Manual Card Selection)
  // ==========================================================================

  private async runComplexTask(task: Task, result: TaskResult): Promise<void> {
    this.log('=== Complex Task Workflow ===', 'info');

    // Enter squad view
    await this.enterSquadView();

    // Execute complex task handler
    const handler = new ComplexTaskHandler(this.browserManager, this.log);
    const success = await handler.execute(task.complexConfig!);

    if (success) {
      result.status = 'completed';
      result.completedRepeats = 1;
      result.totalRepeats = 1;
      this.log('Complex task completed', 'success');

      await this.sbcNavigator.clickClaimRewards();
    } else {
      result.status = 'failed';
      result.error = 'Complex task failed - could not add all required cards';
      this.log('Complex task failed', 'error');
    }
  }

  // ==========================================================================
  // Regular Task Workflow (Squad Builder)
  // ==========================================================================

  private async runRegularTask(task: Task, rules: SquadBuilderRules, result: TaskResult): Promise<void> {
    this.log('=== Regular Task Workflow (Squad Builder) ===', 'info');

    // Get repeat count
    const repeatCount = await this.getRepeatCount(task, result);
    if (repeatCount === 0) return; // Task skipped

    result.totalRepeats = repeatCount;
    this.broadcastTaskStatus(result);

    // Initial setup: enter sub-challenge and clear squad
    await this.enterSubChallengeIfExists();
    await this.handleClearSquad();

    // Execute repeats
    for (let i = 0; i < repeatCount; i++) {
      if (this.shouldStop) {
        this.setStoppedByUser(result);
        return;
      }

      this.log(`=== Repeat ${i + 1}/${repeatCount} ===`, 'info');

      try {
        await this.withTimeout(
          this.executeSquadBuilderRepeat(task, rules, i),
          CONFIG.TIMEOUTS.TASK_REPEAT,
          `Timeout: repeat ${i + 1} exceeded ${CONFIG.TIMEOUTS.TASK_REPEAT / 1000}s`
        );

        result.completedRepeats++;
        this.log(`✓ Completed ${result.completedRepeats}/${repeatCount}`, 'success');
        this.broadcastTaskStatus(result);

        // Navigate back for next repeat
        if (i < repeatCount - 1) {
          await this.sbcNavigator.navigateToSBC();
          await this.sleep(CONFIG.DELAYS.AFTER_NAVIGATION);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(`✗ Repeat ${i + 1} failed: ${errorMsg}`, 'error');
        result.status = 'failed';
        result.error = errorMsg;
        return;
      }
    }

    // Finalize result
    result.status = result.completedRepeats === repeatCount ? 'completed' : 'failed';
    if (result.status === 'failed' && !result.error) {
      result.error = 'Not all repeats completed';
    }
  }

  private async executeSquadBuilderRepeat(task: Task, rules: SquadBuilderRules, repeatIndex: number): Promise<void> {
    // For subsequent repeats, navigate back to card
    if (repeatIndex > 0) {
      await this.navigateBackToCard(task);
      await this.enterSubChallengeIfExists();
    }

    this.throwIfStopped();

    // Check if already completed
    if (await this.sbcNavigator.isCardCompleted()) {
      this.log('Card already completed!', 'success');
      return;
    }

    // Open Squad Builder
    const opened = await this.sbcNavigator.clickUseSquadBuilder();
    if (!opened) throw new Error('Could not open squad builder');

    this.throwIfStopped();

    // Build squad using filters from config
    const squadBuilder = new SquadBuilder(this.browserManager, rules, this.log, task.squadBuilderFilters);
    await squadBuilder.buildSquad();

    this.throwIfStopped();

    // Exchange - if button enabled, requirements were met
    const exchangeSuccess = await this.sbcNavigator.clickExchangePlayers();
    if (!exchangeSuccess) throw new Error('Exchange Players button disabled - requirements not met');

    this.throwIfStopped();

    await this.sbcNavigator.clickClaimRewards();
  }

  // ==========================================================================
  // Navigation Helpers
  // ==========================================================================

  private async navigateToCard(task: Task): Promise<void> {
    await this.sbcNavigator.navigateToSBC();
    await this.sbcNavigator.selectCategory(task.category);

    const found = await this.sbcNavigator.findAndClickCard(task.cardTitle);
    if (!found) {
      throw new Error(`Card not found: ${task.cardTitle}`);
    }
  }

  private async navigateBackToCard(task: Task): Promise<void> {
    this.log('Navigating back to card...');
    await this.sbcNavigator.selectCategory(task.category);

    this.throwIfStopped();

    const found = await this.sbcNavigator.findAndClickCard(task.cardTitle);
    if (!found) throw new Error(`Card not found: ${task.cardTitle}`);
  }

  private async navigateToSBCSafe(): Promise<void> {
    try {
      await this.sbcNavigator.navigateToSBC();
    } catch {
      // Ignore navigation errors
    }
  }

  private async enterSubChallengeIfExists(): Promise<void> {
    const page = this.browserManager.getPage();
    const challengeSlot = page.locator(CONFIG.SELECTORS.CHALLENGE_ROW).first();

    if (await challengeSlot.isVisible({ timeout: 1000 }).catch(() => false)) {
      this.log('Found sub-challenge, clicking...', 'info');
      await challengeSlot.click();
      await this.sleep(CONFIG.DELAYS.AFTER_CLICK);
    }
  }

  private async enterSquadView(): Promise<void> {
    const page = this.browserManager.getPage();
    this.log('Entering squad view...');
    await this.sleep(CONFIG.DELAYS.AFTER_CLICK);

    // Check if already on squad view
    const emptySlot = page.locator(CONFIG.SELECTORS.EMPTY_SLOT).first();
    if (await emptySlot.isVisible({ timeout: 1000 }).catch(() => false)) {
      this.log('Already on squad view');
      return;
    }

    // Try clicking challenge row
    await this.enterSubChallengeIfExists();

    // Check again
    if (await emptySlot.isVisible({ timeout: 2000 }).catch(() => false)) {
      this.log('Entered squad view');
      return;
    }

    // Try Build/Start button
    const buildSelectors = ['button:has-text("Build")', 'button:has-text("Start")', '.call-to-action'];
    for (const selector of buildSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        const text = await btn.textContent().catch(() => '') || '';
        if (text.toLowerCase().includes('build') || text.toLowerCase().includes('start')) {
          this.log(`Clicking "${text.trim()}"...`);
          await btn.click();
          await this.sleep(CONFIG.DELAYS.AFTER_CLICK);
          return;
        }
      }
    }

    this.log('Assuming already on squad view', 'warning');
  }

  // ==========================================================================
  // Clear Squad
  // ==========================================================================

  private async handleClearSquad(): Promise<void> {
    if (!this.ui) return;
    await this.ui.handleClearSquad(CONFIG.DELAYS.AFTER_CLEAR_SQUAD);
  }

  // ==========================================================================
  // Repeat Count
  // ==========================================================================

  private async getRepeatCount(task: Task, result: TaskResult): Promise<number> {
    let repeatCount = task.repeatCount;

    if (task.taskType === 'daily') {
      const pageCount = await this.sbcNavigator.getRepeatCountFromPage();

      if (pageCount !== null) {
        if (pageCount === 0) {
          this.log(`Task "${task.cardTitle}" has 0 repeats available - skipping`, 'warning');
          result.status = 'skipped';
          result.totalRepeats = 0;
          this.broadcastTaskStatus(result);
          return 0;
        }
        repeatCount = pageCount;
        this.log(`Using repeat count from page: ${repeatCount}`, 'info');
      } else {
        this.log(`Using repeat count from config: ${repeatCount}`, 'info');
      }
    }

    return repeatCount;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private createResult(task: Task): TaskResult {
    return {
      taskId: task.id,
      status: 'pending',
      completedRepeats: 0,
      totalRepeats: task.repeatCount,
    };
  }

  private broadcastTaskStatus(result: TaskResult): void {
    this.onTaskStatus?.(result);
  }

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

  private throwIfStopped(): void {
    if (this.shouldStop) throw new Error('Stopped by user');
  }

  private setStoppedByUser(result: TaskResult): void {
    this.log('Execution stopped by user', 'warning');
    result.status = 'failed';
    result.error = 'Stopped by user';
    this.broadcastTaskStatus(result);
  }

  private async sleep(ms: number): Promise<void> {
    await this.browserManager.sleep(ms);
  }
}
