"use client";

import { useState } from "react";

interface InlineEditorProps {
  value: string;
  onSave: (val: string) => Promise<void>;
  multiline?: boolean;
  children: React.ReactNode;
}

export function InlineEditor({ value, onSave, multiline, children }: InlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  if (isEditing) {
    return (
      <div className="relative z-10 my-1 rounded-xl bg-black/40 p-2 outline outline-2 outline-[#d4b07b]/50">
        {multiline ? (
          <textarea
            className="w-full bg-transparent px-2 py-1 font-inherit text-inherit outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={5}
            autoFocus
          />
        ) : (
          <input
            className="w-full bg-transparent px-2 py-1 font-inherit text-inherit outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
          />
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditValue(value);
              setIsEditing(false);
            }}
            className="rounded px-3 py-1 text-xs text-white/60 hover:text-white"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              await onSave(editValue);
              setIsSaving(false);
              setIsEditing(false);
            }}
            className="rounded bg-[#d4b07b] px-3 py-1 text-xs font-semibold text-black hover:bg-[#e4c391]"
          >
            {isSaving ? "..." : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative inline-block max-w-full align-top">
      {children}
      <button
        type="button"
        onClick={() => {
          setEditValue(value);
          setIsEditing(true);
        }}
        className="absolute -right-3 -top-3 z-10 hidden rounded bg-white/10 px-2 py-1 text-[10px] tracking-wide text-white backdrop-blur-md transition hover:bg-[#d4b07b] hover:text-black group-hover:block"
      >
        수정
      </button>
    </div>
  );
}

interface ImageEditorProps {
  images: string[];
  onSave: (val: string[]) => Promise<void>;
  children: React.ReactNode;
}

export function ImageArrayEditor({ images, onSave, children }: ImageEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(images.join("\n"));
  const [isSaving, setIsSaving] = useState(false);

  if (isEditing) {
    return (
      <div className="absolute inset-x-10 top-10 z-50 rounded-2xl bg-black/80 p-6 backdrop-blur outline outline-2 outline-[#d4b07b]">
        <h3 className="mb-4 text-sm font-semibold text-[#d4b07b]">배경 이미지 목록 수정 (권장: 1920x1080 이상, 가로형, WebP/JPG)</h3>
        <textarea
          className="w-full rounded-xl bg-white/5 p-4 font-mono text-sm leading-6 text-white outline-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          rows={6}
          placeholder="이미지 URL을 한 줄에 하나씩 입력하세요"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setEditValue(images.join("\n"));
              setIsEditing(false);
            }}
            className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              const nextArray = editValue.split("\n").map((i) => i.trim()).filter(Boolean);
              await onSave(nextArray);
              setIsSaving(false);
              setIsEditing(false);
            }}
            className="rounded-lg bg-[#d4b07b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#e4c391]"
          >
            {isSaving ? "저장 중..." : "목록 저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative min-h-full min-w-full">
      {children}
      <button
        type="button"
        onClick={() => {
          setEditValue(images.join("\n"));
          setIsEditing(true);
        }}
        className="absolute right-10 top-10 z-40 hidden rounded bg-black/50 px-4 py-2 text-xs font-medium tracking-wide text-white backdrop-blur transition hover:bg-[#d4b07b] hover:text-black group-hover:block"
      >
        배경 사진 변경
      </button>
    </div>
  );
}
