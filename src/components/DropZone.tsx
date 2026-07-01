/**
 * Phase 2.3 — Real Proof Upload (file → base64 data URL)
 * Phase 7.3 — Drag & Drop File Upload with progress
 * Phase 4.4 — Accessible: click-to-browse fallback, aria labels
 *
 * Accepts image/* and video/* files up to 10 MB.
 * Reads the file as a base64 data URL (equivalent of storing a presigned-URL
 * upload result) and calls onFileAccepted with the result.
 *
 * Progress is real (reads from FileReader progressEvent).
 */

import { useState, useRef, useCallback, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"];

export interface DropZoneProps {
  onFileAccepted: (dataUrl: string, fileName: string) => void;
  onError: (message: string) => void;
  currentFileName?: string;
}

function UploadIcon({ dragging }: { dragging: boolean }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={dragging ? "#CCFF00" : "#444"}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: "stroke 0.2s" }}
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function DropZone({ onFileAccepted, onError, currentFileName }: DropZoneProps) {
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(currentFileName ?? null);
  const dropZoneId = useId();
  const statusId = useId();

  const processFile = useCallback(
    (file: File) => {
      // Phase 1.5 — validate type and size at the "API boundary"
      if (!ACCEPTED_TYPES.includes(file.type)) {
        onError(t("errors.invalidFileType"));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        onError(t("errors.fileTooLarge"));
        return;
      }

      setProgress(0);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      reader.onload = () => {
        setProgress(100);
        onFileAccepted(reader.result as string, file.name);
        setTimeout(() => setProgress(null), 600);
      };
      reader.onerror = () => {
        onError(t("errors.genericError"));
        setProgress(null);
      };
      reader.readAsDataURL(file);
    },
    [onFileAccepted, onError, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    []
  );

  const isDone = fileName && progress === null;

  return (
    <div className="flex flex-col gap-2">
      <div
        id={dropZoneId}
        role="button"
        tabIndex={0}
        aria-label={t("tasks.proofFilePlaceholder")}
        aria-describedby={statusId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnd={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={`relative w-full rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
          flex flex-col items-center justify-center gap-3 py-8 px-4 text-center
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CCFF00]/50
          ${dragging
            ? "border-[#CCFF00]/60 bg-[#CCFF00]/5"
            : isDone
            ? "border-[#CCFF00]/30 bg-[#CCFF00]/5"
            : "border-[#1A1A1A] bg-[#000]/40 hover:border-[#333]"
          }`}
      >
        {/* Hidden file input — click-to-browse fallback (Phase 4.4 accessibility) */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleInputChange}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />

        {isDone ? (
          <>
            <div className="w-10 h-10 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center">
              <CheckIcon />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#CCFF00]">{fileName}</p>
              <p className="text-xs text-[#555] mt-0.5">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <motion.div
              animate={dragging && !prefersReduced ? { y: [-2, 2, -2] } : { y: 0 }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            >
              <UploadIcon dragging={dragging} />
            </motion.div>
            <div>
              <p className="text-sm font-medium text-[#999]">
                {dragging ? "Drop to upload" : t("tasks.proofFilePlaceholder")}
              </p>
              <p className="text-xs text-[#555] mt-0.5">Image or video · max 10 MB</p>
            </div>
          </>
        )}

        {/* Progress bar */}
        <AnimatePresence>
          {progress !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl overflow-hidden bg-[#1A1A1A]"
              aria-hidden="true"
            >
              <motion.div
                className="h-full bg-[#CCFF00]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Screen-reader status */}
      <p id={statusId} className="sr-only" aria-live="polite">
        {progress !== null
          ? `Uploading: ${progress}%`
          : fileName
          ? `File ready: ${fileName}`
          : "No file selected"}
      </p>
    </div>
  );
}
