import { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export const SpeedProfile = {
  Fast: 'fast',
  Normal: 'normal',
  Safe: 'safe',
  HumanLike: 'humanlike',
} as const;

export type SpeedProfileType = typeof SpeedProfile[keyof typeof SpeedProfile];

interface SpeedConfig {
  /** Base delay between actions in ms */
  actionDelay: { min: number; max: number };
  /** Mouse movement duration in ms (0 = instant) */
  mouseSpeed: { min: number; max: number };
  /** Typing delay per character in ms (0 = instant) */
  typingDelay: { min: number; max: number };
  /** Use Bezier curves for mouse movement */
  useBezierMouse: boolean;
  /** Add random micro-pauses */
  microPauses: boolean;
}

// ============================================================================
// Speed Profile Configurations
// ============================================================================

const SPEED_CONFIGS: Record<SpeedProfileType, SpeedConfig> = {
  [SpeedProfile.Fast]: {
    actionDelay: { min: 300, max: 500 },
    mouseSpeed: { min: 0, max: 0 }, // Instant
    typingDelay: { min: 0, max: 0 }, // Instant
    useBezierMouse: false,
    microPauses: false,
  },
  [SpeedProfile.Normal]: {
    actionDelay: { min: 800, max: 1200 },
    mouseSpeed: { min: 100, max: 200 },
    typingDelay: { min: 30, max: 50 },
    useBezierMouse: false,
    microPauses: false,
  },
  [SpeedProfile.Safe]: {
    actionDelay: { min: 1500, max: 2500 },
    mouseSpeed: { min: 300, max: 500 },
    typingDelay: { min: 50, max: 100 },
    useBezierMouse: false,
    microPauses: true,
  },
  [SpeedProfile.HumanLike]: {
    actionDelay: { min: 1000, max: 3000 },
    mouseSpeed: { min: 400, max: 800 },
    typingDelay: { min: 50, max: 150 },
    useBezierMouse: true,
    microPauses: true,
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get random number between min and max
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random delay with optional variance
 */
function randomDelay(config: { min: number; max: number }): number {
  return randomBetween(config.min, config.max);
}

/**
 * Calculate point on cubic Bezier curve
 */
function bezierPoint(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Generate random control points for Bezier curve
 * Creates a natural-looking curve with some randomness
 */
function generateControlPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
  const dx = endX - startX;
  const dy = endY - startY;

  // Add randomness to control points (between 20-80% of the distance)
  const cp1Factor = 0.2 + Math.random() * 0.3;
  const cp2Factor = 0.5 + Math.random() * 0.3;

  // Add perpendicular offset for curve
  const perpX = -dy * (0.1 + Math.random() * 0.2) * (Math.random() > 0.5 ? 1 : -1);
  const perpY = dx * (0.1 + Math.random() * 0.2) * (Math.random() > 0.5 ? 1 : -1);

  return {
    cp1x: startX + dx * cp1Factor + perpX,
    cp1y: startY + dy * cp1Factor + perpY,
    cp2x: startX + dx * cp2Factor - perpX * 0.5,
    cp2y: startY + dy * cp2Factor - perpY * 0.5,
  };
}

// ============================================================================
// DelayService Class
// ============================================================================

export class DelayService {
  private profile: SpeedProfileType;
  private config: SpeedConfig;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(profile: SpeedProfileType = SpeedProfile.Normal) {
    this.profile = profile;
    this.config = SPEED_CONFIGS[profile];
  }

  /**
   * Update speed profile
   */
  setProfile(profile: SpeedProfileType): void {
    this.profile = profile;
    this.config = SPEED_CONFIGS[profile];
  }

  /**
   * Get current profile
   */
  getProfile(): SpeedProfileType {
    return this.profile;
  }

  /**
   * Wait between actions with random variance
   */
  async actionDelay(): Promise<void> {
    const delay = randomDelay(this.config.actionDelay);
    await this.sleep(delay);

    // Add occasional micro-pause for more human-like behavior
    if (this.config.microPauses && Math.random() < 0.15) {
      await this.sleep(randomBetween(100, 300));
    }
  }

  /**
   * Short delay for rapid sequences
   */
  async shortDelay(): Promise<void> {
    const base = this.config.actionDelay.min;
    await this.sleep(randomBetween(base * 0.3, base * 0.5));
  }

  /**
   * Long delay for important actions
   */
  async longDelay(): Promise<void> {
    const base = this.config.actionDelay.max;
    await this.sleep(randomBetween(base, base * 1.5));
  }

  /**
   * Move mouse to coordinates with optional human-like movement
   */
  async mouseMove(page: Page, x: number, y: number): Promise<void> {
    if (this.config.useBezierMouse) {
      await this.bezierMouseMove(page, x, y);
    } else if (this.config.mouseSpeed.max > 0) {
      // Linear movement with duration
      const duration = randomDelay(this.config.mouseSpeed);
      const steps = Math.max(10, Math.floor(duration / 16)); // ~60fps
      await page.mouse.move(x, y, { steps });
    } else {
      // Instant movement
      await page.mouse.move(x, y);
    }

    this.lastMouseX = x;
    this.lastMouseY = y;
  }

  /**
   * Human-like mouse movement using Bezier curves
   */
  private async bezierMouseMove(page: Page, endX: number, endY: number): Promise<void> {
    const startX = this.lastMouseX || endX - 100;
    const startY = this.lastMouseY || endY - 100;

    // Generate control points for Bezier curve
    const { cp1x, cp1y, cp2x, cp2y } = generateControlPoints(startX, startY, endX, endY);

    // Calculate number of steps based on distance and speed
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const duration = randomDelay(this.config.mouseSpeed);
    const steps = Math.max(20, Math.floor(distance / 10));

    // Move along Bezier curve
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Add slight acceleration/deceleration (ease-in-out)
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const x = bezierPoint(eased, startX, cp1x, cp2x, endX);
      const y = bezierPoint(eased, startY, cp1y, cp2y, endY);

      await page.mouse.move(x, y);

      // Small delay between movements
      if (i < steps) {
        await this.sleep(duration / steps);
      }
    }

    // Final position adjustment
    await page.mouse.move(endX, endY);
  }

  /**
   * Click with optional movement
   */
  async click(page: Page, x: number, y: number): Promise<void> {
    await this.mouseMove(page, x, y);
    await this.sleep(randomBetween(50, 150)); // Small pause before click
    await page.mouse.click(x, y);
  }

  /**
   * Type text with human-like delays
   */
  async typeText(page: Page, selector: string, text: string): Promise<void> {
    const element = page.locator(selector).first();

    if (this.config.typingDelay.max === 0) {
      // Instant fill
      await element.fill(text);
      return;
    }

    // Click to focus
    await element.click();
    await this.sleep(randomBetween(100, 200));

    // Type character by character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await page.keyboard.type(char);

      // Variable delay based on character type
      let delay = randomDelay(this.config.typingDelay);

      // Longer pause after punctuation
      if ('.!?,;:'.includes(char)) {
        delay *= 2;
      }

      // Occasional longer pause (thinking)
      if (this.config.microPauses && Math.random() < 0.05) {
        delay += randomBetween(200, 500);
      }

      await this.sleep(delay);
    }
  }

  /**
   * Type text directly without selector (when element is focused)
   */
  async typeDirectly(page: Page, text: string): Promise<void> {
    if (this.config.typingDelay.max === 0) {
      await page.keyboard.type(text);
      return;
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await page.keyboard.type(char);

      let delay = randomDelay(this.config.typingDelay);

      if ('.!?,;:'.includes(char)) {
        delay *= 2;
      }

      if (this.config.microPauses && Math.random() < 0.05) {
        delay += randomBetween(200, 500);
      }

      await this.sleep(delay);
    }
  }

  /**
   * Sleep for specified duration
   */
  async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get config for logging/debugging
   */
  getConfig(): SpeedConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Default Instance
// ============================================================================

export const defaultDelayService = new DelayService(SpeedProfile.Normal);
