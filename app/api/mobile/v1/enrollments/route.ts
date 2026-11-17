import { getDb, logActivity, mutate, newId, nowIso } from "@/lib/store";
import { fail, ok, preflight } from "@/lib/mobile-api";
import { bearerIdentity } from "@/lib/mobile-auth";
import { progressOf } from "@/lib/mobile-shape";
import type { Enrollment } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Enrol in a published course. Idempotent: asking twice returns the same run. */
export async function POST(request: Request) {
  const identity = bearerIdentity(request);
  if (!identity) return fail("Sign in to enrol.", 401);
  if (identity.role !== "learner") return fail("Staff accounts cannot enrol as learners.", 403);

  const body = (await request.json().catch(() => null)) as { courseId?: string; courseKey?: string } | null;
  const wanted = (body?.courseId || body?.courseKey || "").trim();
  if (!wanted) return fail("Choose a course.");

  const db = getDb();
  const course = db.courses.find(
    (item) => item.status === "published" && (item.id === wanted || item.key === wanted),
  );
  if (!course) return fail("That course is not open for enrolment.", 404);
  const learner = db.learners.find((item) => item.id === identity.sub);
  if (!learner) return fail("That learner account no longer exists.", 401);

  const existing = db.enrollments.find(
    (item) => item.learnerId === learner.id && item.courseId === course.id,
  );
  if (existing) {
    return ok({ enrollment: existing, progress: progressOf(course, existing), alreadyEnrolled: true });
  }

  const enrollment = await mutate((store) => {
    const created: Enrollment = {
      id: newId("enr"),
      learnerId: learner.id,
      courseId: course.id,
      courseKey: course.key,
      enrolledAt: nowIso(),
      lastSeenAt: nowIso(),
      completedLessonIds: [],
      responses: {},
      completedAt: null,
    };
    store.enrollments.push(created);
    logActivity(
      store,
      "learner.enrolled",
      `${learner.name} enrolled in ${course.code} — ${course.title} from the app.`,
      course.key,
    );
    return created;
  });

  return ok({ enrollment, progress: progressOf(course, enrollment), alreadyEnrolled: false }, 201);
}

export function OPTIONS() {
  return preflight();
}
