'use client';

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Button from "../../../../components/ui/button";
import Card from "../../../../components/ui/card";
import Input from "../../../../components/ui/input";
import Select from "../../../../components/ui/select";
import Textarea from "../../../../components/ui/textarea";
import { createAssignment, fetchCourse, fetchLessonsForModule, fetchModules, saveLesson, saveModule } from "../../../../lib/data";
import type { Course, Lesson, Module } from "../../../../lib/types";

export default function AdminCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params?.courseId;
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [moduleForm, setModuleForm] = useState<{ title_kz: string; title_en: string; order: number }>({ title_kz: "", title_en: "", order: 1 });
  const [lessonForm, setLessonForm] = useState<{
    moduleId: string;
    title_kz: string;
    title_en: string;
    content_kz: string;
    content_en: string;
    videoUrl: string;
    order: number;
    type: Lesson["type"];
  }>({
    moduleId: "",
    title_kz: "",
    title_en: "",
    content_kz: "",
    content_en: "",
    videoUrl: "",
    order: 1,
    type: "video",
  });
  const [assignmentForm, setAssignmentForm] = useState<{
    lessonId: string;
    title_kz: string;
    title_en: string;
    instructions_kz: string;
    instructions_en: string;
  }>({
    lessonId: "",
    title_kz: "",
    title_en: "",
    instructions_kz: "",
    instructions_en: "",
  });

  const load = useCallback(() => {
    if (!courseId) return;
    fetchCourse(courseId).then(setCourse);
    fetchModules(courseId).then(async (mods) => {
      setModules(mods);
      const entries: Record<string, Lesson[]> = {};
      for (const m of mods) {
        entries[m.id] = await fetchLessonsForModule(m.id);
      }
      setLessons(entries);
    });
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const createModule = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveModule({ ...moduleForm, courseId: params.courseId });
    setModuleForm({ title_kz: "", title_en: "", order: 1 });
    load();
  };

  const createLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonForm.moduleId) return;
    await saveLesson({ ...lessonForm });
    setLessonForm({ ...lessonForm, title_kz: "", title_en: "", content_kz: "", content_en: "", videoUrl: "" });
    load();
  };

  const createAssignmentEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.lessonId) return;
    await createAssignment(assignmentForm);
    setAssignmentForm({ lessonId: "", title_kz: "", title_en: "", instructions_kz: "", instructions_en: "" });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">Course</p>
        <h1 className="text-2xl font-semibold">{course?.title_en || params.courseId}</h1>
      </div>
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
              <Select value={lessonForm.moduleId} onChange={(e) => setLessonForm({ ...lessonForm, moduleId: e.target.value })} required>
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
                <p className="text-sm font-semibold">{m.title_en}</p>
                <span className="text-xs text-neutral-500">Order {m.order}</span>
              </div>
              <div className="mt-2 space-y-2">
                {(lessons[m.id] || []).map((lesson) => (
                  <div key={lesson.id} className="rounded-md bg-white px-3 py-2 text-sm shadow-sm">
                    <div className="flex items-center justify-between">
                      <span>{lesson.title_en}</span>
                      <span className="text-xs text-neutral-500">{lesson.type}</span>
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
