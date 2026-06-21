import { RECIPE_CATEGORIES, type RecipeCategory } from "@quick/app-recipes/shared";
import { FilterChip, RecipeCard } from "@quick/app-recipes/ui";
import { CookingPotIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useMemo, useState } from "react";

import { BottomNav } from "@/components/BottomNav";
import { fetchRecipes, recipeImageUrl } from "@/lib/recipes-api";

const RECIPES_QUERY_KEY = ["recipes", "list"] as const;

type Filter = RecipeCategory | "all";

const NewRecipeFab = (): ReactElement => (
  <Link
    to="/recipes/new"
    aria-label="New recipe"
    className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 transition active:scale-95"
  >
    <PlusIcon size={22} weight="bold" />
  </Link>
);

export const RecipesScreen = (): ReactElement => {
  const [filter, setFilter] = useState<Filter>("all");
  const recipes = useQuery({ queryKey: RECIPES_QUERY_KEY, queryFn: fetchRecipes });

  const all = recipes.data ?? [];
  const visible = filter === "all" ? all : all.filter((r) => r.category === filter);
  const cooks = useMemo(() => new Set(all.map((r) => r.cook.name)).size, [all]);

  if (recipes.isPending) {
    return (
      <main className="flex h-dvh flex-col overflow-hidden bg-slate-50">
        <header className="shrink-0 bg-white px-5 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3">
          <h1 className="font-semibold text-2xl text-slate-900 tracking-tight">Recipes</h1>
        </header>
        <div className="flex-1 space-y-3 bg-white px-5 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3.5 py-1">
              <div className="size-16 shrink-0 animate-pulse rounded-xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
        <BottomNav active="recipes" />
      </main>
    );
  }

  if (recipes.isError) {
    return (
      <main className="flex h-dvh flex-col overflow-hidden bg-slate-50">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <WarningCircleIcon size={40} weight="fill" className="text-slate-300" />
          <div>
            <p className="font-medium text-base text-slate-900">Couldn't load recipes</p>
            <p className="mt-1 text-slate-500 text-sm">Check your connection and try again.</p>
          </div>
          <button
            type="button"
            onClick={() => void recipes.refetch()}
            className="flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-6 font-medium text-base text-white transition active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
        <BottomNav active="recipes" />
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 bg-white px-5 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
        <h1 className="font-semibold text-2xl text-slate-900 tracking-tight">Recipes</h1>
        <p className="mt-0.5 text-slate-500 text-sm tabular-nums">
          {all.length} {all.length === 1 ? "recipe" : "recipes"} · {cooks}{" "}
          {cooks === 1 ? "cook" : "cooks"}
        </p>
      </header>

      {all.length > 0 && (
        <div className="shrink-0 bg-white pb-2">
          <div className="flex gap-2 overflow-x-auto px-5">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterChip>
            {RECIPE_CATEGORIES.map((category) => (
              <FilterChip
                key={category}
                active={filter === category}
                onClick={() => setFilter(category)}
              >
                {category}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {all.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-white px-10">
          <div className="-mt-16 text-center">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-slate-100">
              <CookingPotIcon size={34} weight="duotone" className="text-slate-400" />
            </div>
            <div className="font-semibold text-lg text-slate-900">No recipes yet</div>
            <div className="mt-1 text-slate-500 text-sm leading-relaxed">
              Tap{" "}
              <span className="mx-0.5 inline-flex size-5 items-center justify-center rounded-full bg-slate-900 align-middle text-white">
                <PlusIcon size={11} weight="bold" />
              </span>{" "}
              to add your first recipe.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-white px-5">
          {visible.length === 0 ? (
            <p className="pt-10 text-center text-slate-500 text-sm">
              No {filter === "all" ? "" : `${filter.toLowerCase()} `}recipes yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map((recipe) => (
                <Link
                  key={recipe.id}
                  to="/recipes/$recipeId"
                  params={{ recipeId: recipe.id }}
                  className="block rounded-xl transition active:bg-slate-50"
                >
                  <RecipeCard
                    recipe={recipe}
                    imageSrc={recipe.hasImage ? recipeImageUrl(recipe.id) : null}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <NewRecipeFab />
      <BottomNav active="recipes" />
    </main>
  );
};
