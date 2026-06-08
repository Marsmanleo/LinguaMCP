// LinguaMCP — Supabase storage adapter
// Extracted from server.mjs — existing PostgREST logic, zero rewrite

const SCHEMA = "lingua";

/**
 * Create a Supabase storage adapter.
 * @param {object} config
 * @param {string} config.baseUrl - Supabase project URL
 * @param {string} config.anonKey - Anon key
 * @param {string} [config.serviceKey] - Service role key (optional, falls back to anon)
 * @returns {import('./interface.mjs').LinguaStorage}
 */
export function createSupabaseStorage(config) {
  const { baseUrl, anonKey, serviceKey } = config;
  const apiKey = serviceKey || anonKey;

  // ── PostgREST helpers ──────────────────────────────────────

  async function supabaseRequest(path, options = {}) {
    const headers = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Profile": SCHEMA,
      "Content-Profile": SCHEMA,
      ...(options.headers || {}),
    }

    if (options.prefer) {
      headers["Prefer"] = options.prefer
    }

    const url = `${baseUrl}${path}`
    const fetchOptions = {
      method: options.method || "GET",
      headers,
    }

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `Supabase ${response.status}: ${text} [${fetchOptions.method} ${path}]`
      )
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      return response.json()
    }
    return null
  }

  function selectFrom(table, query = "") {
    return supabaseRequest(`/rest/v1/${table}${query ? `?${query}` : ""}`)
  }

  function insertInto(table, data) {
    return supabaseRequest(`/rest/v1/${table}?select=*`, {
      method: "POST",
      body: data,
      prefer: "return=representation",
    })
  }

  function updateWhere(table, filter, data) {
    return supabaseRequest(`/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      body: data,
      prefer: "return=representation",
    })
  }

  function callRpc(fnName, params) {
    return supabaseRequest(`/rest/v1/rpc/${fnName}`, {
      method: "POST",
      body: params,
    })
  }

  // ── Storage interface ──────────────────────────────────────

  return {
    get name() { return "supabase" },

    async getNextLessonId(userId) {
      return callRpc("get_next_lesson", { p_user_id: userId })
    },

    async getLessonWithContent(lessonId) {
      const lessons = await selectFrom(
        "lessons",
        `id=eq.${lessonId}&select=*,chapters(id,chapter_number,title,skill_books(id,slug,title))`
      )

      if (!lessons || lessons.length === 0) return null

      const lesson = lessons[0]
      const chapter = lesson.chapters
      const skillBook = chapter?.skill_books

      return {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content,
        lesson_type: lesson.lesson_type,
        difficulty: lesson.difficulty,
        tags: lesson.tags,
        lesson_number: lesson.lesson_number,
        chapter: chapter
          ? { id: chapter.id, chapter_number: chapter.chapter_number, title: chapter.title }
          : null,
        skill_book: skillBook
          ? { id: skillBook.id, slug: skillBook.slug, title: skillBook.title }
          : null,
      }
    },

    async ensureDailySession(userId, lessonId) {
      const today = new Date().toISOString().split("T")[0]
      const sessions = await selectFrom(
        "daily_sessions",
        `user_id=eq.${userId}&session_date=eq.${today}`
      )

      if (sessions && sessions.length > 0) {
        const session = sessions[0]
        const existingIds = session.lesson_ids || []
        if (!existingIds.includes(lessonId)) {
          await updateWhere(
            "daily_sessions",
            `id=eq.${session.id}`,
            { lesson_ids: [...existingIds, lessonId] }
          )
        }
      } else {
        await insertInto("daily_sessions", {
          user_id: userId,
          session_date: today,
          lesson_ids: [lessonId],
        })
      }
    },

    async markLessonSeen(userId, lessonId) {
      const existing = await selectFrom(
        "user_progress",
        `user_id=eq.${userId}&lesson_id=eq.${lessonId}&select=id,status`
      )

      if (!existing || existing.length === 0) {
        await insertInto("user_progress", {
          user_id: userId,
          lesson_id: lessonId,
          status: "seen",
        })
      }
    },

    async getProgressStats(userId) {
      const allProgress = await selectFrom(
        "user_progress",
        `user_id=eq.${userId}&select=status`
      )

      return {
        total: allProgress.length,
        new: allProgress.filter((p) => p.status === "new").length,
        seen: allProgress.filter((p) => p.status === "seen").length,
        practiced: allProgress.filter((p) => p.status === "practiced").length,
        mastered: allProgress.filter((p) => p.status === "mastered").length,
        skipped: allProgress.filter((p) => p.status === "skipped").length,
      }
    },

    async getDailyProgress(userId) {
      const result = await callRpc("get_daily_progress", { p_user_id: userId })
      return result && result.length > 0 ? result[0] : null
    },

    async upsertProgress(userId, lessonId, status, response, score) {
      const existing = await selectFrom(
        "user_progress",
        `user_id=eq.${userId}&lesson_id=eq.${lessonId}&select=id,status`
      )

      if (existing && existing.length > 0) {
        await updateWhere(
          "user_progress",
          `user_id=eq.${userId}&lesson_id=eq.${lessonId}`,
          {
            status,
            response,
            ...(score !== undefined && score !== null ? { score } : {}),
            practiced_at: new Date().toISOString(),
          }
        )
      } else {
        await insertInto("user_progress", {
          user_id: userId,
          lesson_id: lessonId,
          status,
          response,
          ...(score !== undefined && score !== null ? { score } : {}),
        })
      }
    },
  }
}
