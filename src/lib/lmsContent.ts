/**
 * Shape of a Course's `content` JSON (prisma/schema.prisma) — shared between
 * the seed script that authors modules and the CourseRunner that plays them.
 * Deliberately no time-limit field: modules never enforce a per-block clock.
 */
export interface CourseField {
  id: string;
  type: "text" | "textarea";
  label: string;
  hint?: string;
  rows?: number;
  limit?: number;
  ph?: string;
  required?: boolean; // omit for required (default); set false to make it optional
}

export interface CourseDrill {
  q: string;
  c: string;
  a: string;
}

/** One row of a mission's grading rubric — shown to the learner as a
 *  self-assessment reference, never AI-scored (that's a later phase). */
export interface CourseRubricCriterion {
  key: string;
  name: string;
  anchor1: string;
  anchor3: string;
  anchor5: string;
}

export interface CourseBlockContent {
  id: string;
  title: string;
  goal: string;
  tasks?: string[];
  fields?: CourseField[];
  drills?: CourseDrill[];
  checks: string[];
  trap?: string;
  rubric?: CourseRubricCriterion[];
  modelAnswer?: string;
  asset?: string;
}

export interface CourseContent {
  blocks: CourseBlockContent[];
}
