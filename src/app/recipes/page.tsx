'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Recipe = { id: string; name: string; created_at: string | null };

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data, error } = await supabase
        .from('recipes')
        .select('id,name,created_at')
        .order('created_at', { ascending: false });
      if (error) setErr(error.message);
      setRecipes(data ?? []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link className="text-sm border rounded px-3 py-2 hover:bg-neutral-900" href="/recipes/new">New Recipe</Link>
      </div>

      {err && <p className="text-red-500">{err}</p>}

      {recipes.length === 0 ? (
        <div className="border rounded p-4 text-sm">No recipes yet. Click <i>New Recipe</i> to add one.</div>
      ) : (
        <table className="w-full text-sm table-auto border-separate border-spacing-y-1">
          <thead>
            <tr className="text-left text-neutral-300">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map(r => (
              <tr key={r.id} className="bg-neutral-950/60 hover:bg-neutral-900 rounded">
                <td className="px-3 py-2 rounded-l">
                  <Link className="underline" href={`/recipes/${r.id}`}>{r.name}</Link>
                </td>
                <td className="px-3 py-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                <td className="px-3 py-2 text-right rounded-r">
                  <Link className="underline text-sm" href={`/recipes/new?from=${r.id}`}>Duplicate</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
