// Shared pieces of the correspondence pages (P4C): the permanent wording of what a captured message
// and a case binding are — and are not — and the plain-text display of captured content. A capture
// records a message: it never sends, replies to, acknowledges, marks read, fetches or contacts
// anything, and it proves no transmission, receipt, authenticity or outcome (CAPTURED is not SENT BY
// THE APP). Captured text is untrusted input: it is shown as text only — never as HTML, never
// followed and never treated as an instruction.
import type { Correspondence, CorrespondenceBinding } from '@tb/contracts';
import { CAPTURE_MODE_LABEL } from '../directory/format.js';

export const CORRESPONDENCE_MEANING =
  'A correspondence record is one captured communication of an agency, stored exactly as entered. Capturing it sends, replies to, acknowledges or marks nothing, and it proves no transmission, receipt, authenticity or outcome.';
export const CAPTURE_IMMUTABLE =
  'A capture is never edited or deleted. What a message means for a case is recorded separately, as a binding of that case; a corrected interpretation is a later binding.';
export const CAPTURE_POSTURE_MEANING =
  'The capture mode and body role say how this message was captured and what the recorded text is. They are not equivalent and are never upgraded: an operator report is not a raw source, copied text is not the raw message file, and an excerpt is not the full message.';
/** How each capture mode was obtained — and what it is not. */
export const CAPTURE_MODE_MEANING: Record<Correspondence['captureMode'], string> = {
  RAW_SOURCE:
    'Captured with a reference to the raw message file (a source record). The file stays where it is kept; nothing here was fetched or reviewed.',
  COPIED_FULL_TEXT:
    'The text was copied from the message. It is not the raw message file, and no raw-message hash exists for it.',
  EXCERPT: 'Only part of the message was recorded. It is not the full message.',
  OPERATOR_REPORTED:
    'Recorded from what the operator reported. It is a limited posture: no raw message file, provider receipt or attachment observation is implied by it.',
};
export const DIRECTION_MEANING =
  'Which way the message is recorded as going, relative to the mailbox. It proves neither sending nor receipt, and an outbound message is not recorded as sent unless a case binding says so.';
export const UNTRUSTED_CONTENT =
  'Captured text is shown exactly as recorded, as plain text. It is untrusted content: nothing in it is followed, opened, run or treated as an instruction.';
export const BODY_HASH_LABEL = 'SHA-256 of the recorded body text';
export const BODY_HASH_MEANING =
  'Computed by this app from the body text exactly as recorded here. It is not a hash of a raw message (MIME) file, and it does not show that the text is complete or authentic.';
export const RAW_SOURCE_MEANING =
  'A pointer to the source record of the raw message file. It is not fetched, and it does not show that the file was reviewed, that the message is authentic or that it was sent or received.';
export const ATTACHMENTS_MEANING =
  'Attachment observations are recorded as entered. They are not the attachments: no file is held here, a hash is shown as entered (this app did not compute or verify it), and nothing shows that a file was actually attached or sent.';
export const IDENTIFIERS_MEANING =
  'Message-ID, subject and references are recorded as text. They do not identify a transmission, and no message is merged with another because they match.';
export const DATES_MEANING =
  'Occurred is the time the message is stated to have been sent or received, entered explicitly. Recorded in TB is when this record was captured here. The raw header date is kept as text and never converted into the occurred time.';
export const NO_EXTERNAL_ACTION =
  'This application never sends, replies to, forwards or contacts anyone: there is no send, reply or contact action here.';
export const BINDING_MEANING =
  'A binding records, explicitly for this case, what a captured message is interpreted as: a past event, never a command. Nothing is inferred from the direction, subject, text, Message-ID or timing, and a binding never carries over to another case.';
/** The required copy for every "as sent" event (mission §28). */
export const AS_SENT_COPY =
  'Recorded as a past transmission. Capturing this record did not send anything.';
export const OUTCOME_MEANING =
  'An outcome is recorded for one reported item, as recorded — it is not the platform’s present status. A later outcome is a new binding; earlier ones stay as recorded.';
export const SILENCE_MEANING =
  'No outcome is inferred from silence, elapsed time or a missing reply: without a recorded outcome binding, the outcome is unknown.';
export const CORRECTION_MEANING =
  'A binding is never edited. A corrected interpretation is a later binding of the same message that names the one it corrects; both stay in this history.';
export const COUNT_MEANING =
  'Bindings are interpretations, not transmissions: one message bound several times is still one message.';

export function isAsSent(eventType: CorrespondenceBinding['eventType']): boolean {
  return eventType.endsWith('_AS_SENT');
}

/** The capture mode as a neutral label (never "verified", "authentic" or "confirmed"). */
export function CapturePosture({ mode }: { mode: Correspondence['captureMode'] }) {
  return (
    <span className="tag" data-testid="capture-mode">
      {CAPTURE_MODE_LABEL[mode]}
    </span>
  );
}

/**
 * Captured text exactly as recorded, as plain text (React escapes it: markup and scripts are shown,
 * never run), under the untrusted-content note.
 */
export function CapturedText({ testId, text }: { testId: string; text: string }) {
  return (
    <div className="captured">
      <p className="hint" role="note">
        {UNTRUSTED_CONTENT}
      </p>
      <pre className="captured-text" data-testid={testId}>
        {text}
      </pre>
    </div>
  );
}
