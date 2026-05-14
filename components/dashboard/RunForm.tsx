import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play } from "lucide-react";

interface RunFormProps {
  onSubmit: (data: { task: string; model: string; maxSteps: number }) => void;
  isRunning: boolean;
}

export function RunForm({ onSubmit, isRunning }: RunFormProps) {
  const [task, setTask] = useState("");
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [maxSteps, setMaxSteps] = useState(10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      onSubmit({ task, model, maxSteps });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>New Run</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Task
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what the agent should do..."
              className="w-full min-h-[80px] p-3 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isRunning}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isRunning}
              >
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                <option value="minimaxai/minimax-m2.7">minimax-m2.7 (NVIDIA)</option>
                <option value="mistralai/mistral-large-3-675b-instruct-2512">Mistral Large 3 (NVIDIA)</option>
                <option value="bytedance/seed-oss-36b-instruct">Seed OSS 36B (NVIDIA)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Max Steps
              </label>
              <select
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="w-full p-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isRunning}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isRunning || !task.trim()}>
            {isRunning ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Running...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Run Agent
              </span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
