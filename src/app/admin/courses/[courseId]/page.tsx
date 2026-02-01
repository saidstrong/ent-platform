'use client';

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Button from "../../../../components/ui/button";
import Card from "../../../../components/ui/card";
import Input from "../../../../components/ui/input";
import Select from "../../../../components/ui/select";
import Textarea from "../../../../components/ui/textarea";
import FilePreview from "../../../../components/file-preview";
import {
  addLessonAttachment,
  addLessonResource,
  adminCreateLesson,
  adminCreateModule,
  adminDeleteLesson,
  adminDeleteModule,
  adminListLessonsForModule,
  adminListModules,
  adminUpdateCourse,
  adminUpdateLesson,
  adminUpdateModule,
  createAssignment,
  fetchCourse,
  fetchQuiz,
  removeLessonAttachment,
  removeLessonResource,
  swapOrder,
  upsertQuiz,
  uploadLessonResourceFile,
} from "../../../../lib/data";
import { uploadQuizImage } from "../../../../lib/storage";
import type {
  AiPolicy,
  Course,
  Lesson,
  LessonResource,
  Module,
  Quiz,
  QuizMatchItem,
  QuizOption,
  QuizQuestion,
  QuizQuestionType,
} from "../../../../lib/types";

export default function AdminCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params?.courseId;
  const [course, setCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState<{
    title_kz: string;
    title_en: string;
    description_kz: string;
    description_en: string;
    price: number;
    published: boolean;
  }>({
    title_kz: "",
    title_en: "",
    description_kz: "",
    description_en: "",
    price: 0,
    published: false,
  });
  const [aiPolicyForm, setAiPolicyForm] = useState<Required<AiPolicy>>({
    allowDirectAnswers: true,
    allowFullSolutions: true,
    style: "explain",
    citationRequired: true,
    maxAnswerLength: 0,
  });
  const [savingCourse, setSavingCourse] = useState(false);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [moduleForm, setModuleForm] = useState<{ title_kz: string; title_en: string; order: number }>({ title_kz: "", title_en: "", order: 10 });
  const [lessonForm, setLessonForm] = useState<{
    moduleId: string;
    courseId: string;
    title_kz: string;
    title_en: string;
    content_kz: string;
    content_en: string;
    videoUrl: string;
    order: number;
    type: Lesson["type"];
  }>({
    moduleId: "",
    courseId: courseId || "",
    title_kz: "",
    title_en: "",
    content_kz: "",
    content_en: "",
    videoUrl: "",
    order: 10,
    type: "video",
  });
  const [assignmentForm, setAssignmentForm] = useState<{
    lessonId: string;
    courseId: string;
    title_kz: string;
    title_en: string;
    instructions_kz: string;
    instructions_en: string;
  }>({
    lessonId: "",
    courseId: courseId || "",
    title_kz: "",
    title_en: "",
    instructions_kz: "",
    instructions_en: "",
  });
  const [attachmentBusy, setAttachmentBusy] = useState<string | null>(null);
  const [resourceFiles, setResourceFiles] = useState<Record<string, File | null>>({});
  const [resourceBusy, setResourceBusy] = useState<Record<string, boolean>>({});
  const [resourceErrors, setResourceErrors] = useState<Record<string, string | null>>({});
  const [resourceInputs, setResourceInputs] = useState<Record<string, { linkName: string; linkUrl: string; textName: string; textBody: string }>>({});
  const [quizDrafts, setQuizDrafts] = useState<Record<string, Quiz>>({});
  const [quizBusy, setQuizBusy] = useState<Record<string, boolean>>({});
  const [quizErrors, setQuizErrors] = useState<Record<string, string | null>>({});

  const createId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };

  const nextOrder = (items: { order?: number }[]) => {
    const max = items.reduce((acc, item) => Math.max(acc, item.order || 0), 0);
    return max > 0 ? max + 10 : 10;
  };

  const createQuizOption = (): QuizOption => ({
    id: createId(),
    text_kz: "",
    text_en: "",
  });

  const createMatchItem = (): QuizMatchItem => ({
    id: createId(),
    text_kz: "",
    text_en: "",
  });

  const createQuizQuestion = (type: QuizQuestionType, order: number): QuizQuestion => {
    const base = {
      id: createId(),
      order,
      type,
      prompt_kz: "",
      prompt_en: "",
      points: 1,
    } as QuizQuestion;

    if (type === "single") {
      const options = [createQuizOption(), createQuizOption()];
      return { ...base, type, options, correctOptionId: options[0].id };
    }
    if (type === "multi") {
      const options = [createQuizOption(), createQuizOption()];
      return { ...base, type, options, correctOptionIds: [options[0].id] };
    }
    if (type === "short") {
      return { ...base, type, acceptedAnswers: [], caseSensitive: false, trim: true };
    }
    const left = [createMatchItem(), createMatchItem()];
    const right = [createMatchItem(), createMatchItem()];
    return { ...base, type: "match", left, right, correctPairs: [] };
  };

  const convertQuizQuestionType = (question: QuizQuestion, type: QuizQuestionType): QuizQuestion => {
    const base = {
      id: question.id,
      order: question.order,
      type,
      prompt_kz: question.prompt_kz,
      prompt_en: question.prompt_en,
      imageUrl: question.imageUrl,
      points: question.points,
      explanation_kz: question.explanation_kz,
      explanation_en: question.explanation_en,
    } as QuizQuestion;
    if (type === "single") {
      const options = [createQuizOption(), createQuizOption()];
      return { ...base, type, options, correctOptionId: options[0].id };
    }
    if (type === "multi") {
      const options = [createQuizOption(), createQuizOption()];
      return { ...base, type, options, correctOptionIds: [options[0].id] };
    }
    if (type === "short") {
      return { ...base, type, acceptedAnswers: [], caseSensitive: false, trim: true };
    }
    const left = [createMatchItem(), createMatchItem()];
    const right = [createMatchItem(), createMatchItem()];
    return { ...base, type: "match", left, right, correctPairs: [] };
  };

  const load = useCallback(() => {
    if (!courseId) return;
    fetchCourse(courseId).then((nextCourse) => {
      setCourse(nextCourse);
      if (!nextCourse) return;
      setCourseForm({
        title_kz: nextCourse.title_kz || "",
        title_en: nextCourse.title_en || "",
        description_kz: nextCourse.description_kz || "",
        description_en: nextCourse.description_en || "",
        price: nextCourse.price || 0,
        published: !!nextCourse.published,
      });
      const policy = (nextCourse.aiPolicy || {}) as AiPolicy;
      setAiPolicyForm({
        allowDirectAnswers: policy.allowDirectAnswers ?? true,
        allowFullSolutions: policy.allowFullSolutions ?? true,
        style: policy.style ?? "explain",
        citationRequired: policy.citationRequired ?? true,
        maxAnswerLength: policy.maxAnswerLength ?? 0,
      });
    });
    adminListModules(courseId).then(async (mods) => {
      setModules(mods);
      setModuleForm((prev) => ({ ...prev, order: nextOrder(mods) }));
      const entries: Record<string, Lesson[]> = {};
      for (const m of mods) {
        entries[m.id] = await adminListLessonsForModule(courseId, m.id);
      }
      setLessons(entries);
    });
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveCourseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) return;
    setSavingCourse(true);
    await adminUpdateCourse(courseId, {
      ...courseForm,
      price: Number(courseForm.price) || 0,
      aiPolicy: {
        allowDirectAnswers: !!aiPolicyForm.allowDirectAnswers,
        allowFullSolutions: !!aiPolicyForm.allowFullSolutions,
        style: aiPolicyForm.style || "explain",
        citationRequired: !!aiPolicyForm.citationRequired,
        maxAnswerLength: aiPolicyForm.maxAnswerLength || 0,
      },
    });
    setSavingCourse(false);
    load();
  };

  const createModule = async (e: React.FormEvent) => {
    e.preventDefault();
    const order = moduleForm.order > 0 ? moduleForm.order : nextOrder(modules);
    await adminCreateModule({ ...moduleForm, order, courseId: params.courseId });
    setModuleForm({ title_kz: "", title_en: "", order: nextOrder(modules) });
    load();
  };

  const createLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonForm.moduleId) return;
    const currentLessons = lessons[lessonForm.moduleId] || [];
    const order = lessonForm.order > 0 ? lessonForm.order : nextOrder(currentLessons);
    await adminCreateLesson({ ...lessonForm, order, courseId: params.courseId });
    setLessonForm({ ...lessonForm, title_kz: "", title_en: "", content_kz: "", content_en: "", videoUrl: "", order: nextOrder(currentLessons) });
    load();
  };

  const createAssignmentEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.lessonId) return;
    await createAssignment({ ...assignmentForm, courseId: params.courseId });
    setAssignmentForm({ lessonId: "", courseId: "", title_kz: "", title_en: "", instructions_kz: "", instructions_en: "" });
  };

  const handleUploadAttachment = async (lessonId: string, file: File | null | undefined) => {
    if (!file || !courseId) return;
    setAttachmentBusy(lessonId);
    await addLessonAttachment({ courseId, lessonId, file });
    setAttachmentBusy(null);
    load();
  };

  const handleRemoveAttachment = async (lessonId: string, attachment: { name: string; url: string }) => {
    setAttachmentBusy(lessonId);
    await removeLessonAttachment(lessonId, attachment);
    setAttachmentBusy(null);
    load();
  };

  const setResourceInput = (lessonId: string, patch: Partial<{ linkName: string; linkUrl: string; textName: string; textBody: string }>) => {
    setResourceInputs((prev) => ({
      ...prev,
      [lessonId]: {
        linkName: prev[lessonId]?.linkName ?? "",
        linkUrl: prev[lessonId]?.linkUrl ?? "",
        textName: prev[lessonId]?.textName ?? "",
        textBody: prev[lessonId]?.textBody ?? "",
        ...patch,
      },
    }));
  };

  const uploadResourceFile = async (lessonId: string) => {
    const file = resourceFiles[lessonId];
    if (!file || !courseId) return;
    setResourceBusy((prev) => ({ ...prev, [lessonId]: true }));
    setResourceErrors((prev) => ({ ...prev, [lessonId]: null }));
    try {
      const uploaded = await uploadLessonResourceFile({ courseId, lessonId, file });
      await addLessonResource(lessonId, uploaded);
      setResourceFiles((prev) => ({ ...prev, [lessonId]: null }));
      load();
    } catch (err) {
      setResourceErrors((prev) => ({
        ...prev,
        [lessonId]: err instanceof Error ? err.message : "Failed to upload resource.",
      }));
    } finally {
      setResourceBusy((prev) => ({ ...prev, [lessonId]: false }));
    }
  };

  const addLinkResource = async (lessonId: string) => {
    const input = resourceInputs[lessonId];
    const url = input?.linkUrl?.trim();
    if (!url) return;
    const name = input?.linkName?.trim() || url;
    const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
    const resource: LessonResource = { id: createId(), kind: isYoutube ? "youtube" : "link", name, url };
    await addLessonResource(lessonId, resource);
    setResourceInput(lessonId, { linkName: "", linkUrl: "" });
    load();
  };

  const addTextResource = async (lessonId: string) => {
    const input = resourceInputs[lessonId];
    const textBody = input?.textBody?.trim();
    if (!textBody) return;
    const name = input?.textName?.trim() || "Note";
    const resource: LessonResource = { id: createId(), kind: "note", name, text: textBody, url: "" };
    await addLessonResource(lessonId, resource);
    setResourceInput(lessonId, { textName: "", textBody: "" });
    load();
  };

  const removeResource = async (lessonId: string, resource: LessonResource) => {
    if (!resource.id) return;
    await removeLessonResource(lessonId, resource.id);
    load();
  };

  const loadQuizDraft = async (lesson: Lesson) => {
    if (!courseId) return;
    setQuizBusy((prev) => ({ ...prev, [lesson.id]: true }));
    setQuizErrors((prev) => ({ ...prev, [lesson.id]: null }));
    try {
      const existing = await fetchQuiz(lesson.id);
      const draft: Quiz = existing ?? {
        id: lesson.id,
        lessonId: lesson.id,
        courseId,
        schemaVersion: 2,
        title_kz: lesson.title_kz || "",
        title_en: lesson.title_en || "",
        passPercent: 70,
        settings: {},
        questions: [],
      };
      setQuizDrafts((prev) => ({ ...prev, [lesson.id]: draft }));
    } catch (err) {
      setQuizErrors((prev) => ({ ...prev, [lesson.id]: err instanceof Error ? err.message : "Failed to load quiz." }));
    } finally {
      setQuizBusy((prev) => ({ ...prev, [lesson.id]: false }));
    }
  };

  const updateQuizDraft = (lessonId: string, patch: Partial<Quiz>) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: { ...prev[lessonId], ...patch },
    }));
  };

  const updateQuizQuestion = (lessonId: string, questionId: string, patch: Partial<QuizQuestion>) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          (prev[lessonId]?.questions.map((q) =>
            q.id === questionId ? ({ ...q, ...patch } as QuizQuestion) : q,
          ) ?? []) as QuizQuestion[],
      },
    }));
  };

  const addQuizQuestion = (lessonId: string, type: QuizQuestionType) => {
    setQuizDrafts((prev) => {
      const current = prev[lessonId];
      const order = (current?.questions?.length || 0) + 1;
      const newQuestion = createQuizQuestion(type, order);
      return {
        ...prev,
        [lessonId]: {
          ...current,
          questions: [...(current?.questions ?? []), newQuestion],
        },
      };
    });
  };

  const removeQuizQuestion = (lessonId: string, questionId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions: prev[lessonId]?.questions.filter((q) => q.id !== questionId) ?? [],
      },
    }));
  };

  const moveQuizQuestion = (lessonId: string, questionId: string, direction: "up" | "down") => {
    setQuizDrafts((prev) => {
      const questions = [...(prev[lessonId]?.questions ?? [])];
      const index = questions.findIndex((q) => q.id === questionId);
      if (index < 0) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= questions.length) return prev;
      const current = questions[index];
      const target = questions[targetIndex];
      questions[index] = { ...target, order: current.order };
      questions[targetIndex] = { ...current, order: target.order };
      return {
        ...prev,
        [lessonId]: { ...prev[lessonId], questions },
      };
    });
  };

  const updateQuizQuestionType = (lessonId: string, questionId: string, type: QuizQuestionType) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => (q.id === questionId ? convertQuizQuestionType(q, type) : q)) ?? [],
      },
    }));
  };

  const updateQuizOption = (lessonId: string, questionId: string, optionId: string, patch: Partial<QuizOption>) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || (q.type !== "single" && q.type !== "multi")) return q;
            return { ...q, options: q.options.map((opt) => (opt.id === optionId ? { ...opt, ...patch } : opt)) };
          }) ?? [],
      },
    }));
  };

  const addQuizOption = (lessonId: string, questionId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || (q.type !== "single" && q.type !== "multi")) return q;
            const newOption = createQuizOption();
            const nextOptions = [...q.options, newOption];
            if (q.type === "single" && !q.correctOptionId) {
              return { ...q, options: nextOptions, correctOptionId: newOption.id };
            }
            if (q.type === "multi" && q.correctOptionIds.length === 0) {
              return { ...q, options: nextOptions, correctOptionIds: [newOption.id] };
            }
            return { ...q, options: nextOptions };
          }) ?? [],
      },
    }));
  };

  const removeQuizOption = (lessonId: string, questionId: string, optionId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || (q.type !== "single" && q.type !== "multi")) return q;
            const nextOptions = q.options.filter((opt) => opt.id !== optionId);
            if (q.type === "single") {
              const nextCorrect = q.correctOptionId === optionId ? nextOptions[0]?.id || "" : q.correctOptionId;
              return { ...q, options: nextOptions, correctOptionId: nextCorrect };
            }
            const nextCorrectIds = q.correctOptionIds.filter((id) => id !== optionId);
            return { ...q, options: nextOptions, correctOptionIds: nextCorrectIds };
          }) ?? [],
      },
    }));
  };

  const setSingleCorrectOption = (lessonId: string, questionId: string, optionId: string) => {
    updateQuizQuestion(lessonId, questionId, { correctOptionId: optionId } as Partial<QuizQuestion>);
  };

  const toggleMultiCorrectOption = (lessonId: string, questionId: string, optionId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || q.type !== "multi") return q;
            const next = new Set(q.correctOptionIds);
            if (next.has(optionId)) {
              next.delete(optionId);
            } else {
              next.add(optionId);
            }
            return { ...q, correctOptionIds: Array.from(next) };
          }) ?? [],
      },
    }));
  };

  const updateMatchItem = (lessonId: string, questionId: string, side: "left" | "right", itemId: string, patch: Partial<QuizMatchItem>) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || q.type !== "match") return q;
            const nextList = q[side].map((item) => (item.id === itemId ? { ...item, ...patch } : item));
            return { ...q, [side]: nextList };
          }) ?? [],
      },
    }));
  };

  const addMatchItem = (lessonId: string, questionId: string, side: "left" | "right") => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || q.type !== "match") return q;
            return { ...q, [side]: [...q[side], createMatchItem()] };
          }) ?? [],
      },
    }));
  };

  const removeMatchItem = (lessonId: string, questionId: string, side: "left" | "right", itemId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || q.type !== "match") return q;
            const nextList = q[side].filter((item) => item.id !== itemId);
            const nextPairs = q.correctPairs.filter((pair) => pair.leftId !== itemId && pair.rightId !== itemId);
            return { ...q, [side]: nextList, correctPairs: nextPairs };
          }) ?? [],
      },
    }));
  };

  const updateMatchPair = (lessonId: string, questionId: string, leftId: string, rightId: string) => {
    setQuizDrafts((prev) => ({
      ...prev,
      [lessonId]: {
        ...prev[lessonId],
        questions:
          prev[lessonId]?.questions.map((q) => {
            if (q.id !== questionId || q.type !== "match") return q;
            const nextPairs = q.correctPairs.filter((pair) => pair.leftId !== leftId);
            if (rightId) {
              nextPairs.push({ leftId, rightId });
            }
            return { ...q, correctPairs: nextPairs };
          }) ?? [],
      },
    }));
  };

  const uploadQuestionImage = async (lessonId: string, questionId: string, file: File | null | undefined) => {
    if (!file || !courseId) return;
    setQuizBusy((prev) => ({ ...prev, [lessonId]: true }));
    setQuizErrors((prev) => ({ ...prev, [lessonId]: null }));
    try {
      const uploaded = await uploadQuizImage(courseId, lessonId, file);
      updateQuizQuestion(lessonId, questionId, { imageUrl: uploaded.url });
    } catch (err) {
      setQuizErrors((prev) => ({ ...prev, [lessonId]: err instanceof Error ? err.message : "Failed to upload image." }));
    } finally {
      setQuizBusy((prev) => ({ ...prev, [lessonId]: false }));
    }
  };

  const uploadOptionImage = async (lessonId: string, questionId: string, optionId: string, file: File | null | undefined) => {
    if (!file || !courseId) return;
    setQuizBusy((prev) => ({ ...prev, [lessonId]: true }));
    setQuizErrors((prev) => ({ ...prev, [lessonId]: null }));
    try {
      const uploaded = await uploadQuizImage(courseId, lessonId, file);
      updateQuizOption(lessonId, questionId, optionId, { imageUrl: uploaded.url });
    } catch (err) {
      setQuizErrors((prev) => ({ ...prev, [lessonId]: err instanceof Error ? err.message : "Failed to upload image." }));
    } finally {
      setQuizBusy((prev) => ({ ...prev, [lessonId]: false }));
    }
  };

  const saveQuizDraft = async (lessonId: string) => {
    const draft = quizDrafts[lessonId];
    if (!draft) return;
    setQuizBusy((prev) => ({ ...prev, [lessonId]: true }));
    setQuizErrors((prev) => ({ ...prev, [lessonId]: null }));
    try {
      const orderedQuestions = [...draft.questions].sort((a, b) => a.order - b.order);
      await upsertQuiz(lessonId, {
        courseId: draft.courseId,
        lessonId,
        title_kz: draft.title_kz,
        title_en: draft.title_en,
        passPercent: Number(draft.passPercent) || 0,
        settings: draft.settings ?? {},
        questions: orderedQuestions,
      });
    } catch (err) {
      setQuizErrors((prev) => ({ ...prev, [lessonId]: err instanceof Error ? err.message : "Failed to save quiz." }));
    } finally {
      setQuizBusy((prev) => ({ ...prev, [lessonId]: false }));
    }
  };

  const renameModule = async (module: Module) => {
    const titleEn = window.prompt("Module title (EN)", module.title_en || "");
    if (!titleEn) return;
    const titleKz = window.prompt("Module title (KZ)", module.title_kz || "") || module.title_kz;
    await adminUpdateModule(module.id, { title_en: titleEn, title_kz: titleKz });
    load();
  };

  const deleteModule = async (module: Module) => {
    if (!window.confirm(`Delete module "${module.title_en}"?`)) return;
    const moduleLessons = lessons[module.id] || [];
    await Promise.all(moduleLessons.map((lesson) => adminDeleteLesson(lesson.id)));
    await adminDeleteModule(module.id);
    load();
  };

  const moveModule = async (moduleIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? moduleIndex - 1 : moduleIndex + 1;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    await swapOrder("modules", modules[moduleIndex], modules[targetIndex]);
    load();
  };

  const renameLesson = async (lesson: Lesson) => {
    const titleEn = window.prompt("Lesson title (EN)", lesson.title_en || "");
    if (!titleEn) return;
    const titleKz = window.prompt("Lesson title (KZ)", lesson.title_kz || "") || lesson.title_kz;
    await adminUpdateLesson(lesson.id, { title_en: titleEn, title_kz: titleKz });
    load();
  };

  const deleteLesson = async (lesson: Lesson) => {
    if (!window.confirm(`Delete lesson "${lesson.title_en}"?`)) return;
    await adminDeleteLesson(lesson.id);
    load();
  };

  const moveLesson = async (moduleId: string, lessonIndex: number, direction: "up" | "down") => {
    const moduleLessons = lessons[moduleId] || [];
    const targetIndex = direction === "up" ? lessonIndex - 1 : lessonIndex + 1;
    if (targetIndex < 0 || targetIndex >= moduleLessons.length) return;
    await swapOrder("lessons", moduleLessons[lessonIndex], moduleLessons[targetIndex]);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">Course</p>
        <h1 className="text-2xl font-semibold">{course?.title_en || params.courseId}</h1>
      </div>
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Course settings</h3>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={saveCourseSettings}>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Title (KZ)</label>
            <Input value={courseForm.title_kz} onChange={(e) => setCourseForm({ ...courseForm, title_kz: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Title (EN)</label>
            <Input value={courseForm.title_en} onChange={(e) => setCourseForm({ ...courseForm, title_en: e.target.value })} required />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-neutral-700">Description (KZ)</label>
            <Textarea rows={3} value={courseForm.description_kz} onChange={(e) => setCourseForm({ ...courseForm, description_kz: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-neutral-700">Description (EN)</label>
            <Textarea rows={3} value={courseForm.description_en} onChange={(e) => setCourseForm({ ...courseForm, description_en: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Price (KZT)</label>
            <Input type="number" value={courseForm.price} onChange={(e) => setCourseForm({ ...courseForm, price: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="published"
              type="checkbox"
              checked={courseForm.published}
              onChange={(e) => setCourseForm({ ...courseForm, published: e.target.checked })}
            />
            <label htmlFor="published" className="text-sm text-neutral-700">
              Published
            </label>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={savingCourse}>
              {savingCourse ? "Saving..." : "Save course"}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h3 className="mb-3 text-lg font-semibold">AI Policy</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={aiPolicyForm.allowDirectAnswers}
              onChange={(e) => setAiPolicyForm((prev) => ({ ...prev, allowDirectAnswers: e.target.checked }))}
            />
            Allow direct answers (quiz/assignment)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={aiPolicyForm.allowFullSolutions}
              onChange={(e) => setAiPolicyForm((prev) => ({ ...prev, allowFullSolutions: e.target.checked }))}
            />
            Allow full solutions
          </label>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-neutral-700">Help style</label>
            <Select
              value={aiPolicyForm.style}
              onChange={(e) => {
                const nextStyle = e.target.value === "socratic" ? "socratic" : "explain";
                setAiPolicyForm((prev) => ({ ...prev, style: nextStyle }));
              }}
            >
              <option value="explain">Explain</option>
              <option value="socratic">Socratic</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-neutral-700">Max answer length (optional)</label>
            <Input
              type="number"
              min={0}
              value={aiPolicyForm.maxAnswerLength}
              onChange={(e) => setAiPolicyForm((prev) => ({ ...prev, maxAnswerLength: Number(e.target.value || 0) }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2">
            <input
              type="checkbox"
              checked={aiPolicyForm.citationRequired}
              onChange={(e) => setAiPolicyForm((prev) => ({ ...prev, citationRequired: e.target.checked }))}
            />
            Require citations when sources are available
          </label>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Add module</h3>
          <form className="space-y-3" onSubmit={createModule}>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (KZ)</label>
              <Input value={moduleForm.title_kz} onChange={(e) => setModuleForm({ ...moduleForm, title_kz: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (EN)</label>
              <Input value={moduleForm.title_en} onChange={(e) => setModuleForm({ ...moduleForm, title_en: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Order</label>
              <Input type="number" value={moduleForm.order} onChange={(e) => setModuleForm({ ...moduleForm, order: Number(e.target.value) })} />
            </div>
            <Button type="submit">Save module</Button>
          </form>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-semibold">Add lesson</h3>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createLesson}>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700">Module</label>
              <Select
                value={lessonForm.moduleId}
                onChange={(e) => {
                  const moduleId = e.target.value;
                  const currentLessons = lessons[moduleId] || [];
                  setLessonForm((prev) => ({ ...prev, moduleId, order: nextOrder(currentLessons) }));
                }}
                required
              >
                <option value="">Select module</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title_en}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (KZ)</label>
              <Input value={lessonForm.title_kz} onChange={(e) => setLessonForm({ ...lessonForm, title_kz: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (EN)</label>
              <Input value={lessonForm.title_en} onChange={(e) => setLessonForm({ ...lessonForm, title_en: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Type</label>
              <Select value={lessonForm.type} onChange={(e) => setLessonForm({ ...lessonForm, type: e.target.value as Lesson["type"] })}>
                <option value="video">video</option>
                <option value="text">text</option>
                <option value="quiz">quiz</option>
                <option value="live">live</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Order</label>
              <Input type="number" value={lessonForm.order} onChange={(e) => setLessonForm({ ...lessonForm, order: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700">Content (KZ)</label>
              <Textarea rows={3} value={lessonForm.content_kz} onChange={(e) => setLessonForm({ ...lessonForm, content_kz: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700">Content (EN)</label>
              <Textarea rows={3} value={lessonForm.content_en} onChange={(e) => setLessonForm({ ...lessonForm, content_en: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700">Video URL</label>
              <Input value={lessonForm.videoUrl} onChange={(e) => setLessonForm({ ...lessonForm, videoUrl: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Save lesson</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-semibold">Add assignment</h3>
          <form className="space-y-3" onSubmit={createAssignmentEntry}>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Lesson</label>
              <Select value={assignmentForm.lessonId} onChange={(e) => setAssignmentForm({ ...assignmentForm, lessonId: e.target.value })} required>
                <option value="">Select lesson</option>
                {modules.flatMap((m) => lessons[m.id] || []).map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title_en}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (KZ)</label>
              <Input value={assignmentForm.title_kz} onChange={(e) => setAssignmentForm({ ...assignmentForm, title_kz: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Title (EN)</label>
              <Input value={assignmentForm.title_en} onChange={(e) => setAssignmentForm({ ...assignmentForm, title_en: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Instructions (KZ)</label>
              <Textarea
                rows={3}
                value={assignmentForm.instructions_kz}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions_kz: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-neutral-700">Instructions (EN)</label>
              <Textarea
                rows={3}
                value={assignmentForm.instructions_en}
                onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions_en: e.target.value })}
                required
              />
            </div>
            <Button type="submit">Save assignment</Button>
          </form>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-lg font-semibold">Modules</h3>
        <div className="space-y-3">
          {modules.map((m) => (
            <div key={m.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{m.title_en}</p>
                  <span className="text-xs text-neutral-500">Order {m.order}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Button size="sm" variant="ghost" onClick={() => moveModule(modules.indexOf(m), "up")}>
                    Up
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => moveModule(modules.indexOf(m), "down")}>
                    Down
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => renameModule(m)}>
                    Rename
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteModule(m)}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {(lessons[m.id] || []).map((lesson, lessonIndex) => (
                  <div key={lesson.id} className="rounded-md bg-white px-3 py-2 text-sm shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span>{lesson.title_en}</span>
                        <span className="ml-2 text-xs text-neutral-500">{lesson.type}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Button size="sm" variant="ghost" onClick={() => moveLesson(m.id, lessonIndex, "up")}>
                          Up
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => moveLesson(m.id, lessonIndex, "down")}>
                          Down
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => renameLesson(lesson)}>
                          Rename
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteLesson(lesson)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2 text-xs text-neutral-600">
                      {lesson.attachments && lesson.attachments.length > 0 ? (
                        <ul className="space-y-1">
                          {lesson.attachments.map((att) => (
                            <li key={att.url} className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <FilePreview url={att.url} filename={att.name} />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={attachmentBusy === lesson.id}
                                onClick={() => handleRemoveAttachment(lesson.id, att)}
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No attachments</p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          onChange={(e) => handleUploadAttachment(lesson.id, e.target.files?.[0])}
                          disabled={attachmentBusy === lesson.id}
                        />
                        {attachmentBusy === lesson.id && <span className="text-[11px] text-neutral-500">Uploading...</span>}
                      </div>

                      <div className="mt-3 space-y-2 rounded-md border border-neutral-100 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase text-neutral-500">Resources</p>
                          {resourceErrors[lesson.id] && <span className="text-[11px] text-red-600">{resourceErrors[lesson.id]}</span>}
                        </div>
                        {lesson.resources && lesson.resources.length > 0 ? (
                          <ul className="space-y-1 text-xs text-neutral-700">
                            {lesson.resources.map((res, idx) => {
                              const resourceLink = res.downloadUrl || res.url;
                              return (
                                <li key={res.id || `${res.kind}-${res.name}-${idx}`} className="flex items-center justify-between gap-2">
                                  <div className="flex-1">
                                    {res.kind === "file" && resourceLink ? (
                                      <FilePreview url={resourceLink} filename={res.name} contentType={res.contentType} />
                                    ) : (
                                      <span className="truncate">
                                        {res.kind.toUpperCase()}: {res.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {resourceLink && (
                                      <a className="text-blue-700" href={resourceLink} target="_blank" rel="noreferrer">
                                        Open
                                      </a>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => removeResource(lesson.id, res)}>
                                      Remove
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-neutral-500">No resources</p>
                        )}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              onChange={(e) => setResourceFiles((prev) => ({ ...prev, [lesson.id]: e.target.files?.[0] || null }))}
                              disabled={resourceBusy[lesson.id]}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!resourceFiles[lesson.id] || resourceBusy[lesson.id]}
                              onClick={() => uploadResourceFile(lesson.id)}
                            >
                              {resourceBusy[lesson.id] ? "Uploading..." : "Upload file"}
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-[1fr,120px]">
                            <Input
                              placeholder="Link URL"
                              value={resourceInputs[lesson.id]?.linkUrl ?? ""}
                              onChange={(e) => setResourceInput(lesson.id, { linkUrl: e.target.value })}
                            />
                            <Button size="sm" variant="secondary" onClick={() => addLinkResource(lesson.id)}>
                              Add link
                            </Button>
                            <Input
                              placeholder="Link name (optional)"
                              value={resourceInputs[lesson.id]?.linkName ?? ""}
                              onChange={(e) => setResourceInput(lesson.id, { linkName: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="Note title"
                              value={resourceInputs[lesson.id]?.textName ?? ""}
                              onChange={(e) => setResourceInput(lesson.id, { textName: e.target.value })}
                            />
                            <Textarea
                              rows={3}
                              placeholder="Text note"
                              value={resourceInputs[lesson.id]?.textBody ?? ""}
                              onChange={(e) => setResourceInput(lesson.id, { textBody: e.target.value })}
                            />
                            <Button size="sm" variant="secondary" onClick={() => addTextResource(lesson.id)}>
                              Add note
                            </Button>
                          </div>
                        </div>
                      </div>

                      {lesson.type === "quiz" && (
                        <div className="mt-3 space-y-2 rounded-md border border-neutral-100 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase text-neutral-500">Quiz/Test</p>
                            <div className="flex items-center gap-2">
                              {quizErrors[lesson.id] && <span className="text-[11px] text-red-600">{quizErrors[lesson.id]}</span>}
                              {!quizDrafts[lesson.id] && (
                                <Button size="sm" variant="secondary" onClick={() => loadQuizDraft(lesson)}>
                                  Load quiz
                                </Button>
                              )}
                            </div>
                          </div>
                          {quizDrafts[lesson.id] &&
                            (() => {
                              const draft = quizDrafts[lesson.id];
                              const orderedQuestions = [...draft.questions].sort((a, b) => a.order - b.order);
                              const totalPoints = orderedQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
                              return (
                                <div className="space-y-3 text-xs">
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <Input
                                      placeholder="Quiz title (KZ)"
                                      value={draft.title_kz ?? ""}
                                      onChange={(e) => updateQuizDraft(lesson.id, { title_kz: e.target.value })}
                                    />
                                    <Input
                                      placeholder="Quiz title (EN)"
                                      value={draft.title_en ?? ""}
                                      onChange={(e) => updateQuizDraft(lesson.id, { title_en: e.target.value })}
                                    />
                                    <Input
                                      type="number"
                                      placeholder="Pass %"
                                      value={draft.passPercent ?? 0}
                                      onChange={(e) => updateQuizDraft(lesson.id, { passPercent: Number(e.target.value) })}
                                    />
                                    <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                                      Total points: {totalPoints}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => addQuizQuestion(lesson.id, "single")}>
                                      Add single choice
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => addQuizQuestion(lesson.id, "multi")}>
                                      Add multi choice
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => addQuizQuestion(lesson.id, "short")}>
                                      Add short answer
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => addQuizQuestion(lesson.id, "match")}>
                                      Add matching
                                    </Button>
                                  </div>
                                  <div className="space-y-3">
                                    {orderedQuestions.map((q, idx) => (
                                      <div key={q.id} className="rounded-md border border-neutral-200 p-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-xs font-semibold">Question {idx + 1}</p>
                                          <div className="flex items-center gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => moveQuizQuestion(lesson.id, q.id, "up")}>
                                              Up
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => moveQuizQuestion(lesson.id, q.id, "down")}>
                                              Down
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => removeQuizQuestion(lesson.id, q.id)}>
                                              Remove
                                            </Button>
                                          </div>
                                        </div>
                                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                                          <Select value={q.type} onChange={(e) => updateQuizQuestionType(lesson.id, q.id, e.target.value as QuizQuestionType)}>
                                            <option value="single">single</option>
                                            <option value="multi">multi</option>
                                            <option value="short">short</option>
                                            <option value="match">match</option>
                                          </Select>
                                          <Input
                                            type="number"
                                            placeholder="Points"
                                            value={q.points}
                                            onChange={(e) => updateQuizQuestion(lesson.id, q.id, { points: Number(e.target.value) })}
                                          />
                                          <div className="space-y-2">
                                            <input type="file" onChange={(e) => uploadQuestionImage(lesson.id, q.id, e.target.files?.[0])} />
                                            {q.imageUrl && <FilePreview url={q.imageUrl} maxHeight={140} />}
                                          </div>
                                        </div>
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          <Textarea
                                            rows={2}
                                            placeholder="Prompt (KZ)"
                                            value={q.prompt_kz}
                                            onChange={(e) => updateQuizQuestion(lesson.id, q.id, { prompt_kz: e.target.value })}
                                          />
                                          <Textarea
                                            rows={2}
                                            placeholder="Prompt (EN)"
                                            value={q.prompt_en}
                                            onChange={(e) => updateQuizQuestion(lesson.id, q.id, { prompt_en: e.target.value })}
                                          />
                                        </div>
                                        {(q.type === "single" || q.type === "multi") && (
                                          <div className="mt-2 space-y-2">
                                            {q.options.map((opt) => (
                                              <div key={opt.id} className="grid gap-2 md:grid-cols-[24px,1fr,1fr,140px,80px]">
                                                {q.type === "single" ? (
                                                  <input
                                                    type="radio"
                                                    checked={q.correctOptionId === opt.id}
                                                    onChange={() => setSingleCorrectOption(lesson.id, q.id, opt.id)}
                                                  />
                                                ) : (
                                                  <input
                                                    type="checkbox"
                                                    checked={q.correctOptionIds.includes(opt.id)}
                                                    onChange={() => toggleMultiCorrectOption(lesson.id, q.id, opt.id)}
                                                  />
                                                )}
                                                <Input
                                                  placeholder="Option (KZ)"
                                                  value={opt.text_kz}
                                                  onChange={(e) => updateQuizOption(lesson.id, q.id, opt.id, { text_kz: e.target.value })}
                                                />
                                                <Input
                                                  placeholder="Option (EN)"
                                                  value={opt.text_en}
                                                  onChange={(e) => updateQuizOption(lesson.id, q.id, opt.id, { text_en: e.target.value })}
                                                />
                                                <div className="space-y-2">
                                                  <input type="file" onChange={(e) => uploadOptionImage(lesson.id, q.id, opt.id, e.target.files?.[0])} />
                                                  {opt.imageUrl && <FilePreview url={opt.imageUrl} maxHeight={120} />}
                                                </div>
                                                <Button size="sm" variant="ghost" onClick={() => removeQuizOption(lesson.id, q.id, opt.id)}>
                                                  Remove
                                                </Button>
                                              </div>
                                            ))}
                                            <Button size="sm" variant="secondary" onClick={() => addQuizOption(lesson.id, q.id)}>
                                              Add option
                                            </Button>
                                          </div>
                                        )}
                                        {q.type === "short" && (
                                          <div className="mt-2 space-y-2">
                                            <Input
                                              placeholder="Accepted answers (comma separated)"
                                              value={q.acceptedAnswers.join(", ")}
                                              onChange={(e) =>
                                                updateQuizQuestion(lesson.id, q.id, {
                                                  acceptedAnswers: e.target.value
                                                    .split(",")
                                                    .map((val) => val.trim())
                                                    .filter((val) => val.length > 0),
                                                })
                                              }
                                            />
                                            <div className="flex items-center gap-4">
                                              <label className="flex items-center gap-2 text-xs">
                                                <input
                                                  type="checkbox"
                                                  checked={q.caseSensitive}
                                                  onChange={(e) => updateQuizQuestion(lesson.id, q.id, { caseSensitive: e.target.checked })}
                                                />
                                                Case sensitive
                                              </label>
                                              <label className="flex items-center gap-2 text-xs">
                                                <input
                                                  type="checkbox"
                                                  checked={q.trim}
                                                  onChange={(e) => updateQuizQuestion(lesson.id, q.id, { trim: e.target.checked })}
                                                />
                                                Trim whitespace
                                              </label>
                                            </div>
                                          </div>
                                        )}
                                        {q.type === "match" && (
                                          <div className="mt-2 space-y-3">
                                            <div className="grid gap-3 md:grid-cols-2">
                                              <div className="space-y-2">
                                                <p className="text-[11px] uppercase text-neutral-500">Left</p>
                                                {q.left.map((item) => (
                                                  <div key={item.id} className="grid gap-2 md:grid-cols-[1fr,1fr,60px]">
                                                    <Input
                                                      placeholder="KZ"
                                                      value={item.text_kz}
                                                      onChange={(e) => updateMatchItem(lesson.id, q.id, "left", item.id, { text_kz: e.target.value })}
                                                    />
                                                    <Input
                                                      placeholder="EN"
                                                      value={item.text_en}
                                                      onChange={(e) => updateMatchItem(lesson.id, q.id, "left", item.id, { text_en: e.target.value })}
                                                    />
                                                    <Button size="sm" variant="ghost" onClick={() => removeMatchItem(lesson.id, q.id, "left", item.id)}>
                                                      Remove
                                                    </Button>
                                                  </div>
                                                ))}
                                                <Button size="sm" variant="secondary" onClick={() => addMatchItem(lesson.id, q.id, "left")}>
                                                  Add left
                                                </Button>
                                              </div>
                                              <div className="space-y-2">
                                                <p className="text-[11px] uppercase text-neutral-500">Right</p>
                                                {q.right.map((item) => (
                                                  <div key={item.id} className="grid gap-2 md:grid-cols-[1fr,1fr,60px]">
                                                    <Input
                                                      placeholder="KZ"
                                                      value={item.text_kz}
                                                      onChange={(e) => updateMatchItem(lesson.id, q.id, "right", item.id, { text_kz: e.target.value })}
                                                    />
                                                    <Input
                                                      placeholder="EN"
                                                      value={item.text_en}
                                                      onChange={(e) => updateMatchItem(lesson.id, q.id, "right", item.id, { text_en: e.target.value })}
                                                    />
                                                    <Button size="sm" variant="ghost" onClick={() => removeMatchItem(lesson.id, q.id, "right", item.id)}>
                                                      Remove
                                                    </Button>
                                                  </div>
                                                ))}
                                                <Button size="sm" variant="secondary" onClick={() => addMatchItem(lesson.id, q.id, "right")}>
                                                  Add right
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="space-y-2">
                                              <p className="text-[11px] uppercase text-neutral-500">Correct pairs</p>
                                              {q.left.map((item) => {
                                                const selected = q.correctPairs.find((pair) => pair.leftId === item.id)?.rightId || "";
                                                return (
                                                  <div key={item.id} className="grid gap-2 md:grid-cols-[1fr,1fr]">
                                                    <span>{item.text_en || item.text_kz || "Left item"}</span>
                                                    <Select
                                                      value={selected}
                                                      onChange={(e) => updateMatchPair(lesson.id, q.id, item.id, e.target.value)}
                                                    >
                                                      <option value="">Select right item</option>
                                                      {q.right.map((rightItem) => (
                                                        <option key={rightItem.id} value={rightItem.id}>
                                                          {rightItem.text_en || rightItem.text_kz || "Right item"}
                                                        </option>
                                                      ))}
                                                    </Select>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button size="sm" disabled={quizBusy[lesson.id]} onClick={() => saveQuizDraft(lesson.id)}>
                                        {quizBusy[lesson.id] ? "Saving..." : "Save quiz"}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(lessons[m.id] || []).length === 0 && <p className="text-xs text-neutral-500">No lessons.</p>}
              </div>
            </div>
          ))}
          {modules.length === 0 && <p className="text-sm text-neutral-600">No modules yet.</p>}
        </div>
      </Card>
    </div>
  );
}
