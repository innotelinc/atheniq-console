import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Screen,
  Body,
  Button,
  Card,
  Chip,
  Divider,
  ErrorNote,
  Heading,
  Loading,
  Muted,
  ProgressBar,
} from "@/components/ui";
import { api, errorMessage, priceLabel, type CourseDetail } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, radius, space, type } from "@/lib/theme";

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { learner, staff } = useSession();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await api.course(id, learner?.token);
      setCourse(detail);
      setOpenModule((current) => current ?? detail.modules[0]?.id ?? null);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id, learner?.token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const enrol = async () => {
    if (!learner) {
      router.push(`/sign-in?next=${encodeURIComponent(`/course/${id}`)}`);
      return;
    }
    setBusy(true);
    try {
      await api.enroll(id, learner.token);
      await load();
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!course && !error) {
    return (
      <Screen>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
        </View>
        <Loading label="Opening the course" />
      </Screen>
    );
  }

  if (!course) {
    return (
      <Screen>
        <View style={styles.topbar}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={styles.content}>
          <ErrorNote message={error} />
        </View>
      </Screen>
    );
  }

  const enrolled = Boolean(course.enrollment);
  const progress = course.progress;
  const complete = Boolean(course.enrollment?.completedAt);

  return (
    <Screen>
      <View style={styles.topbar}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.topbarCode}>{course.code}</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{course.department.toUpperCase()}</Text>
        <Text style={styles.title}>{course.title}</Text>
        <Body>{course.summary}</Body>

        <View style={styles.chips}>
          <Chip label={`${course.credits} credits`} tone="brand" />
          <Chip label={`Level ${course.level}`} />
          <Chip label={`${course.lessons} lessons`} />
          <Chip label={`${Math.round(course.minutes / 60)} hours`} />
          <Chip label={priceLabel(course.price)} />
        </View>

        {course.programs.length ? <Muted>{course.programs.join(" · ")}</Muted> : null}

        {enrolled ? (
          <Card style={{ gap: space(2) }}>
            <View style={styles.progressHead}>
              <Heading>{complete ? "Course complete" : "Your progress"}</Heading>
              <Text style={styles.percent}>{progress.percent}%</Text>
            </View>
            <ProgressBar percent={progress.percent} />
            <Muted>
              {progress.done} of {progress.total} lessons
              {complete ? " · certificate queued with the registrar" : ""}
            </Muted>
            {!complete && progress.nextLessonId ? (
              <Button
                label={`Continue: ${progress.nextLessonTitle ?? "next lesson"}`}
                onPress={() => router.push(`/lesson/${course.id}/${progress.nextLessonId}`)}
              />
            ) : complete ? (
              <Button
                label="Review the course"
                variant="ghost"
                onPress={() => router.push(`/lesson/${course.id}/${course.modules[0].lessons[0].id}`)}
              />
            ) : null}
          </Card>
        ) : (
          <Card style={{ gap: space(2.5) }}>
            <Heading>Take this course here</Heading>
            <Muted>
              {staff
                ? "Staff accounts browse the catalogue; sign in as a learner under Account to enrol."
                : "Enrolling keeps your place across lessons and queues a certificate for the registrar when you finish."}
            </Muted>
            <Button
              label={learner ? "Enrol in this course" : "Sign in to enrol"}
              onPress={enrol}
              loading={busy}
            />
          </Card>
        )}

        {error ? <ErrorNote message={error} /> : null}

        <Section title="What you will be able to do">
          {course.outcomes.map((outcome) => (
            <View key={outcome} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{outcome}</Text>
            </View>
          ))}
        </Section>

        <Section title="Who it is for">
          <Body>{course.audience}</Body>
          {course.prerequisites.length ? (
            <Muted>Before you start: {course.prerequisites.join("; ")}</Muted>
          ) : null}
        </Section>

        <Section title={`Curriculum · ${course.modules.length} modules`}>
          {course.modules.map((module, index) => {
            const open = openModule === module.id;
            const done = module.lessons.filter((lesson) => lesson.done).length;
            return (
              <Card key={module.id} style={{ gap: space(2) }}>
                <Pressable onPress={() => setOpenModule(open ? null : module.id)}>
                  <View style={styles.moduleHead}>
                    <View style={{ flex: 1 }}>
                      <Muted>MODULE {index + 1}</Muted>
                      <Text style={styles.moduleTitle}>{module.title}</Text>
                    </View>
                    <Text style={styles.moduleCount}>
                      {done}/{module.lessons.length}
                    </Text>
                  </View>
                </Pressable>
                {open ? (
                  <>
                    <Muted>{module.summary}</Muted>
                    <Divider />
                    {module.lessons.map((lesson, lessonIndex) => (
                      <Pressable
                        key={lesson.id}
                        disabled={!enrolled}
                        onPress={() => router.push(`/lesson/${course.id}/${lesson.id}`)}
                        style={styles.lessonRow}
                      >
                        <Text style={[styles.lessonMark, lesson.done && { color: colors.brand }]}>
                          {lesson.done ? "✓" : String(lessonIndex + 1).padStart(2, "0")}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lessonTitle}>{lesson.title}</Text>
                          <Text style={styles.lessonMeta}>
                            {lesson.type} · {lesson.minutes} min
                          </Text>
                        </View>
                        {enrolled ? <Text style={styles.chevron}>›</Text> : <Text style={styles.lock}>locked</Text>}
                      </Pressable>
                    ))}
                    <Text style={styles.assessment}>Assessment: {module.assessment}</Text>
                  </>
                ) : null}
              </Card>
            );
          })}
        </Section>

        <Section title="How you are graded">
          {course.grading.map((item) => (
            <View key={item.component} style={styles.gradeRow}>
              <Text style={styles.bulletText}>{item.component}</Text>
              <Text style={styles.gradeWeight}>{item.weight}%</Text>
            </View>
          ))}
        </Section>

        {course.description ? (
          <Section title="About the course">
            <Body>{course.description}</Body>
          </Section>
        ) : null}

        <Text style={styles.footnote}>
          Course key {course.key} · {course.modules.length} modules · {course.lessons} lessons
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space(2.5) }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}>
      <Text style={styles.backText}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: colors.ink, fontSize: 24, lineHeight: 26, marginTop: -2 },
  topbarCode: { ...type.tiny, color: colors.faint, fontWeight: "700", letterSpacing: 1.2 },
  content: { paddingHorizontal: space(5), paddingBottom: space(16), gap: space(4) },
  eyebrow: { ...type.tiny, color: colors.brand, fontWeight: "700", letterSpacing: 1.4 },
  title: { ...type.display, fontSize: 28, lineHeight: 34, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  percent: { color: colors.brand, fontWeight: "700", fontSize: 15 },
  sectionTitle: { ...type.heading, color: colors.ink, marginTop: space(2) },
  bulletRow: { flexDirection: "row", gap: space(2.5) },
  bullet: { color: colors.brand, fontSize: 16, lineHeight: 24 },
  bulletText: { ...type.body, color: colors.soft, flex: 1 },
  moduleHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  moduleTitle: { ...type.heading, color: colors.ink, marginTop: 2 },
  moduleCount: { ...type.small, color: colors.faint },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(2) },
  lessonMark: { ...type.small, color: colors.faint, width: 22, fontWeight: "700" },
  lessonTitle: { ...type.small, color: colors.ink, fontWeight: "600" },
  lessonMeta: { ...type.small, color: colors.faint, marginTop: 2, textTransform: "capitalize" },
  chevron: { color: colors.faint, fontSize: 20 },
  lock: { ...type.tiny, color: colors.faint },
  assessment: { ...type.small, color: colors.faint, marginTop: space(1) },
  gradeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  gradeWeight: { ...type.small, color: colors.ink, fontWeight: "700" },
  footnote: { ...type.tiny, color: colors.faint, marginTop: space(4), lineHeight: 16 },
});
