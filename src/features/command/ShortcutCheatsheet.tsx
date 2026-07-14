import Modal from "@/components/ui/Modal";

const SHORTCUTS = [
  {
    group: "全局",
    items: [
      { keys: "⌘K", desc: "打开命令面板" },
      { keys: "⌘⇧F", desc: "全局搜索" },
      { keys: "⌘Z", desc: "撤销" },
      { keys: "⌘⇧Z", desc: "重做" },
      { keys: "?", desc: "打开本速查表" },
      { keys: "Esc", desc: "关闭弹窗 / 菜单" },
    ],
  },
  {
    group: "画布",
    items: [
      { keys: "=", desc: "放大" },
      { keys: "-", desc: "缩小" },
      { keys: "0", desc: "适应视图" },
      { keys: "⇧R", desc: "重置布局" },
      { keys: "⌘滚轮", desc: "缩放（ReactFlow 内置）" },
      { keys: "Del", desc: "删除选中节点" },
      { keys: "⌘↵", desc: "编辑节点" },
    ],
  },
] as const;

export default function ShortcutCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="快捷键速查表" className="max-w-lg">
      <div className="space-y-4">
        {SHORTCUTS.map((section) => (
          <div key={section.group}>
            <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-2">
              {section.group}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div
                  key={item.desc}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-sm text-ink-secondary">{item.desc}</span>
                  <kbd className="font-mono text-2xs px-1.5 py-0.5 rounded border border-line bg-canvas-sunken text-ink-muted">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
