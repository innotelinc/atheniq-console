/**
 * One client for the console's mobile API.
 *
 * The base URL is baked in at build time from EXPO_PUBLIC_API_BASE; the default
 * is the school's own registrar host. Every call is JSON over HTTPS and carries
 * a bearer token when the person is signed in.
 */
const RAW_BASE = process.env.EXPO_PUBLIC_API_BASE || "https://registrar.atheniq.institute";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/mobile/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new ApiError("The server sent something unexpected. Try again.", response.status);
  }
  if (!response.ok || parsed.ok === false) {
    throw new ApiError(
      typeof parsed.error === "string" ? parsed.error : `Request failed (${response.status}).`,
      response.status,
      parsed,
    );
  }
  return parsed.data as T;
}

/* ------------------------------------------------------------------ */
/* Shapes the API returns                                              */
/* ------------------------------------------------------------------ */

export interface CourseCard {
  id: string;
  code: string;
  key: string;
  title: string;
  summary: string;
  credits: number;
  level: number;
  department: string;
  minutes: number;
  lessons: number;
  modules: number;
  price: { plan: string | null; amountCents: number | null };
  programs: string[];
  tracks?: string[];
  outcome: string;
}

export interface Catalog {
  courses: CourseCard[];
  programs: { id: string; name: string; credential: string; credits: number; tuitionPerCreditCents: number }[];
  brand: { name: string; tagline: string; accent: string };
}

export interface Progress {
  total: number;
  done: number;
  percent: number;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
}

export interface LessonRow {
  id: string;
  title: string;
  type: "reading" | "video" | "lab" | "discussion" | "quiz" | "project" | "exam";
  minutes: number;
  done: boolean;
}

export interface CourseDetail extends Omit<CourseCard, "modules"> {
  description: string;
  outcomes: string[];
  audience: string;
  prerequisites: string[];
  grading: { component: string; weight: number }[];
  modules: { id: string; title: string; summary: string; assessment: string; lessons: LessonRow[] }[];
  enrollment: { id: string; enrolledAt: string; completedAt: string | null; progress: Progress } | null;
  progress: Progress;
}

export interface ContentBlock {
  kind: "lede" | "heading" | "paragraph" | "list" | "quote" | "callout" | "steps";
  text?: string;
  items?: string[];
  label?: string;
}

export interface LessonContent {
  course: { id: string; code: string; title: string };
  id: string;
  title: string;
  type: LessonRow["type"];
  minutes: number;
  moduleTitle: string;
  objectives: string[];
  blocks: ContentBlock[];
  prompt?: string;
  needsResponse: boolean;
  done: boolean;
  response: string;
  position: { index: number; total: number };
  nextLessonId: string | null;
}

export interface LearnerSession {
  token: string;
  learner: { id: string; name: string; email: string; programId: string | null };
}

export interface StaffSession {
  token: string;
  staff: { id: string; name: string; email: string; role: "registrar" | "publisher"; title: string };
}

export interface MyLearning {
  learner: {
    id: string;
    name: string;
    email: string;
    programId: string | null;
    programName: string | null;
    enrolledAt: string;
  };
  stats: { enrolled: number; completed: number; inProgress: number; credits: number; certificates: number };
  enrollments: {
    id: string;
    enrolledAt: string;
    completedAt: string | null;
    lastSeenAt: string;
    course: CourseCard;
    progress: Progress;
  }[];
  credentials: {
    id: string;
    verifyId: string;
    title: string;
    type: string;
    status: string;
    issuedAt: string | null;
    createdAt: string;
    subjectLabel: string;
  }[];
}

export interface RegistrarOverview {
  staff: { id: string; name: string; email: string; role: string };
  counts: {
    learners: number;
    newLearners: number;
    enrollments: number;
    active: number;
    completions: number;
    certificatesQueued: number;
    certificatesIssued: number;
    publishedCourses: number;
  };
  queue: {
    id: string;
    title: string;
    learner: string;
    email: string;
    type: string;
    status: string;
    verifyId: string;
    createdAt: string;
    detail: string;
  }[];
  activity: { id: string; at: string; kind: string; message: string }[];
  recentLearners: { id: string; name: string; email: string; enrolledAt: string; courses: number }[];
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const api = {
  catalog: () => request<Catalog>("/catalog"),
  course: (id: string, token?: string | null) =>
    request<CourseDetail>(`/courses/${encodeURIComponent(id)}`, { token }),
  lesson: (courseId: string, lessonId: string, token: string) =>
    request<LessonContent>(
      `/lesson?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
      { token },
    ),
  register: (body: { name: string; email: string; password: string; programId?: string | null }) =>
    request<LearnerSession>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<LearnerSession>("/auth/login", { method: "POST", body }),
  staffLogin: (body: { email: string; password: string; code?: string }) =>
    request<StaffSession>("/staff/login", { method: "POST", body }),
  me: (token: string) => request<MyLearning>("/me", { token }),
  enroll: (courseId: string, token: string) =>
    request<{ enrollment: unknown; progress: Progress; alreadyEnrolled: boolean }>("/enrollments", {
      method: "POST",
      body: { courseId },
      token,
    }),
  progress: (
    token: string,
    body: { courseId: string; lessonId: string; done?: boolean; response?: string },
  ) =>
    request<{ progress: Progress; completedAt: string | null; credential: unknown }>("/progress", {
      method: "POST",
      body,
      token,
    }),
  registrar: (token: string) => request<RegistrarOverview>("/registrar", { token }),
  issue: (token: string, credentialId: string) =>
    request<{ credentialId: string; status: string; verifyId?: string }>("/registrar/issue", {
      method: "POST",
      body: { credentialId },
      token,
    }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

export function priceLabel(price: { plan: string | null; amountCents: number | null }): string {
  if (price.amountCents && price.amountCents > 0) {
    return `$${Math.round(price.amountCents / 100).toLocaleString()}`;
  }
  return price.plan ? "Included" : "Free";
}
