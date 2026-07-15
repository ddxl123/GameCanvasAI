import { useCallback, useState } from "react";
import type { CanvasElement } from "@/types";
import { generateContent } from "@/services/aiService";

// 复用 aiService 中的 GenerationResult 类型，保持对外接口不变
export type { GenerationResult } from "@/services/aiService";

/**
 * 节点生成 hook：委托 aiService.generateContent 完成实际生成。
 *
 * - 维护 generatingKeys 集合，记录哪些节点正在生成
 * - generate(element, prompt)：调用 aiService（已配置 key 走真实 API，否则模拟）
 * - isGenerating(key)：查询某个节点是否正在生成
 */
export function useNodeGeneration() {
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());

  const generate = useCallback(
    (element: CanvasElement, prompt: string) => {
      // 前置去重：已在生成中则不重复发起
      if (generatingKeys.has(element.key)) {
        return Promise.reject(
          new Error("该元素正在生成中，请勿重复触发")
        );
      }
      setGeneratingKeys((prev) => {
        const next = new Set(prev);
        next.add(element.key);
        return next;
      });

      // 委托 aiService：已配置 key 走真实 API，否则走模拟生成
      return generateContent(element, prompt).finally(() => {
        setGeneratingKeys((prev) => {
          const next = new Set(prev);
          next.delete(element.key);
          return next;
        });
      });
    },
    [generatingKeys]
  );

  const isGenerating = useCallback(
    (key: string) => generatingKeys.has(key),
    [generatingKeys]
  );

  return { generatingKeys, isGenerating, generate };
}
