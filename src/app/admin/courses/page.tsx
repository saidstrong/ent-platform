'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "../../../components/ui/button";
import Card from "../../../components/ui/card";
import Input from "../../../components/ui/input";
import Select from "../../../components/ui/select";
import Textarea from "../../../components/ui/textarea";
import { listAllCourses, saveCourse } from "../../../lib/data";
import type { Course, CourseCategory, CourseLevel } from "../../../lib/types";

type CourseForm = {
  title_kz: string;
  title_en: string;
  description_kz: string;
  description_en: string;
  category: CourseCategory;
  tags: string;
  level: CourseLevel;
  durationWeeks: number;
  price: number;
  currency: "KZT";
  published: boolean;
};

const emptyCourse: CourseForm = {
  title_kz: "",
  title_en: "",
  description_kz: "",
  description_en: "",
  category: "exam",
  tags: "ENT,Math,Physics",
  level: "beginner",
  durationWeeks: 8,
  price: 0,
  currency: "KZT",
  published: false,
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<CourseForm>(emptyCourse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listAllCourses().then(setCourses);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await saveCourse({
        ...form,
        tags: form.tags.split(",").map((t: string) => t.trim()),
      });
      setForm(emptyCourse);
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save course";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (course: Course) => {
    await saveCourse({ id: course.id, published: !course.published });
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Create / update course</h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Title (KZ)</label>
            <Input value={form.title_kz} onChange={(e) => setForm({ ...form, title_kz: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Title (EN)</label>
            <Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Description (KZ)</label>
            <Textarea rows={3} value={form.description_kz} onChange={(e) => setForm({ ...form, description_kz: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Description (EN)</label>
            <Textarea rows={3} value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Level</label>
            <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as CourseLevel })}>
              <option value="beginner">beginner</option>
              <option value="intermediate">intermediate</option>
              <option value="advanced">advanced</option>
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Duration (weeks)</label>
            <Input type="number" value={form.durationWeeks} onChange={(e) => setForm({ ...form, durationWeeks: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Price (KZT)</label>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-sm font-semibold text-neutral-700">Tags (comma)</label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save course"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{course.title_en}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${course.published ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                {course.published ? "Published" : "Draft"}
              </span>
            </div>
            <p className="text-sm text-neutral-600">{course.description_en}</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => togglePublish(course)}>
                {course.published ? "Unpublish" : "Publish"}
              </Button>
              <Link href={`/admin/courses/${course.id}`}>
                <Button size="sm">Manage modules</Button>
              </Link>
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="text-sm text-neutral-600">No courses yet.</p>}
      </div>
    </div>
  );
}
