# XY Assistant V2 � Product & Behavior Spec

## A. Goals
- Always provide a helpful response (no dead-end loops).
- Default to GPT-like general assistance for platform help and general questions.
- When the user selects materials, answers must be grounded in those materials.

## B. Modes
B) Two modes
1) General Mode (default)
Use when:
    No sources are selected.
Capabilities:
    Answer general questions (GPT-like).
    
    Answer platform questions using the Platform Handbook.

    If the user is on a course/lesson page, it may reference basic metadata (course title, lesson title) but must not pretend to cite PDFs/transcripts unless selected.

2) Grounded Mode (manual selection)
Use when:
    User selects 1+ sources (PDF and/or YouTube transcript).
Rules:
    Claims about the materials must be supported by the selected sources.
    If the sources don’t contain the answer:
        say “not found in selected materials”
        optionally provide a clearly labeled general explanation.

## C. Source types
- **PDF**: extracted text (server cached).
- **YouTube**: teacher-provided transcript text (stored/cached).
- **Tests**: explicitly out of scope as selectable sources (for now).

## D. Input/Output Contract (product-level)
### Inputs (conceptual)
- User message
- Language (EN/KZ)
- Optional selected sources (list with type + display name)
- Optional course/lesson context if the user is currently on those pages

### Outputs
- `answer` (clean, user-facing, no weird citation IDs)
- `sourcesSummary` (human-readable, one line)
- `references[]` (optional, behind �Show references� toggle; human-formatted)

- sourcesSummary examples
    Sources: XY-School handbook
    Sources: Course metadata; Chapter 10.pdf (pages 0–1); YouTube transcript: Lecture 3

- references[] formatting rules
    Never show internal IDs.
    PDF references should show:
        file name
        page range if known
        optional short excerpt label (not raw text dump)
    YouTube references should show:
        video title
        timestamp ranges if transcript supports timestamps

## E. UX requirements
- Assistant panel shows a scope indicator (General / Grounded).
- �Add sources� picker (manual selection).
- Selected source chips (removable).
- Chat messages must render in correct chronological order (user message above assistant reply).
- No duplicate messages after refresh.
- No �Citations: id#30� style strings shown to users.
- Assistant does not answer a lesson-content question with “teacher context missing” if the question is general/platform-level.

## F. Sources formatting rules
### sourcesSummary examples
- �Sources: Platform handbook�
- �Sources: Course metadata; Chapter 10.pdf (pages 0�1); YouTube transcript: Lecture 3�

### references[] formatting
- PDF: show file name + page range (if available) and short excerpt label (not raw IDs).
- YouTube: show video title + timestamp ranges if transcript supports it (otherwise �transcript excerpt�).
- Never show internal Firestore IDs to end users.

## G. Quality & safety
- Must avoid hallucinating �according to PDF� when the PDF is not selected/available.
- Must clearly label when it switches from grounded to general explanation.
- Academic integrity note: �If this is for an assessment, I can give hints and explanations.�

## H. Analytics (high-level)
- Log: scope (general/grounded), selected source count, courseId/lessonId if present, outcome (success / needs_more_context / error_recovered).
- Do not block responses if analytics fails.

## I. Non-goals (explicit)
- No automatic �guess the lesson� grounding without user selecting sources (for V2 initial rebuild).
- No tests/quizzes as selectable sources.

## Implementation Notes (for engineering)
- TODO: Define the �Add sources� UI (PDF picker + transcript selector).
- TODO: Decide the storage format for YouTube transcript text.
- TODO: Map page ranges for PDF excerpts when page data is available; otherwise show excerpt indices.
- TODO: Confirm localized copy for EN/KZ; add RU only if product decides to support it.
