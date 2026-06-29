"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Props = {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

export default function CodeEditor({ code, onChange, readOnly = false }: Props) {
  const language = useMemo(() => "python", []);

  return (
    <div className="code-editor-shell">
      <MonacoEditor
        height="100%"
        language={language}
        value={code}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontLigatures: true,
          readOnly,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          padding: { top: 14, bottom: 14 }
        }}
        onChange={(value) => onChange(value ?? "")}
      />
    </div>
  );
}
