// LinguaMCP — Storage interface
// Both Supabase and SQLite adapters implement this contract.
// Tool handlers call these methods only — they never touch storage internals.

/**
 * @typedef {Object} Lesson
 * @property {string} id - UUID
 * @property {string} title
 * @property {string} content
 * @property {string} lesson_type - concept | reading | vocabulary | practice
 * @property {string} difficulty - beginner | intermediate | advanced
 * @property {string[]} tags
 * @property {number} lesson_number
 * @property {Object} chapter - { id, chapter_number, title }
 * @property {Object} skill_book - { id, slug, title }
 */

/**
 * @typedef {Object} ProgressStats
 * @property {number} total
 * @property {number} new
 * @property {number} seen
 * @property {number} practiced
 * @property {number} mastered
 * @property {number} skipped
 */

/**
 * @typedef {Object} DailySession
 * @property {string} id - UUID
 * @property {string} session_date - YYYY-MM-DD
 * @property {number} total_lessons
 * @property {number} practiced
 * @property {number} mastered
 * @property {number} remaining
 */

/**
 * @typedef {Object} ProgressRecord
 * @property {string} id
 * @property {string} status
 */

export const LinguaStorage = {
  /** @returns {Promise<string|null>} Next unseen lesson UUID, or null if all done */
  async getNextLessonId(userId) { throw new Error("Not implemented") },

  /**
   * @param {string} lessonId
   * @returns {Promise<Lesson|null>}
   */
  async getLessonWithContent(lessonId) { throw new Error("Not implemented") },

  /**
   * Ensure a daily session exists for today and add the lesson to it.
   * @returns {Promise<void>}
   */
  async ensureDailySession(userId, lessonId) { throw new Error("Not implemented") },

  /**
   * Mark a lesson as 'seen' only if no progress exists yet.
   * Never downgrades skipped/practiced/mastered back to seen.
   * @returns {Promise<void>}
   */
  async markLessonSeen(userId, lessonId) { throw new Error("Not implemented") },

  /**
   * @returns {Promise<ProgressStats>}
   */
  async getProgressStats(userId) { throw new Error("Not implemented") },

  /**
   * @returns {Promise<DailySession|null>}
   */
  async getDailyProgress(userId) { throw new Error("Not implemented") },

  /**
   * Upsert a progress record for a lesson.
   * @param {string} userId
   * @param {string} lessonId
   * @param {string} status - practiced | mastered
   * @param {string} response
   * @param {number|null} score
   * @returns {Promise<void>}
   */
  async upsertProgress(userId, lessonId, status, response, score) { throw new Error("Not implemented") },

  /**
   * @returns {Promise<string>} Adapter name for logging (e.g. "sqlite", "supabase")
   */
  get name() { throw new Error("Not implemented") },
}
