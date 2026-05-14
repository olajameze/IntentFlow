import { createClient } from "@/utils/supabase/server";

export default async function TodosPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-lg font-semibold">Todos (Supabase SSR demo)</h1>
        <p className="text-sm text-muted-foreground">
          Add <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (e.g. in{" "}
          <code className="rounded bg-muted px-1">web/.env.local</code> or CI secrets) to load live rows from Supabase.
        </p>
      </div>
    );
  }

  const supabase = createClient();

  const { data: todos } = await supabase.from("todos").select();

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Todos (Supabase SSR demo)</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Create a <code className="rounded bg-muted px-1">todos</code> table in Supabase to see rows here. Main dashboard remains at{" "}
        <a className="text-primary underline" href="/">
          /
        </a>
        .
      </p>
      <ul className="list-inside list-disc space-y-1">
        {todos?.map((todo: { id: string; name?: string }) => (
          <li key={todo.id}>{todo.name ?? todo.id}</li>
        ))}
        {todos?.length === 0 ? <li className="text-muted-foreground">No rows yet.</li> : null}
      </ul>
    </div>
  );
}
