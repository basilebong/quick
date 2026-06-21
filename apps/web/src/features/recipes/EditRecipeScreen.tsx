import { type CreateRecipeInput, type Recipe, RecipeIdSchema } from "@quick/app-recipes/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { fetchRecipe, updateRecipe } from "@/lib/recipes-api";
import { RecipeForm, type RecipeFormValues } from "./RecipeForm";

const toValues = (recipe: Recipe): RecipeFormValues => ({
  title: recipe.title,
  category: recipe.category,
  description: recipe.description,
  image: recipe.image,
  minutes: recipe.minutes,
  serves: recipe.serves,
  ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity })),
  steps: recipe.steps.map((s) => ({
    title: s.title,
    body: s.body,
    timers: s.timers.map((t) => String(t.minutes)),
  })),
});

const Notice = ({
  recipeId,
  title,
  body,
}: {
  recipeId: string;
  title: string;
  body: string;
}): ReactElement => (
  <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-white px-8 text-center">
    <div>
      <p className="font-medium text-base text-slate-900">{title}</p>
      <p className="mt-1 text-slate-500 text-sm">{body}</p>
    </div>
    <Link
      to="/recipes/$recipeId"
      params={{ recipeId }}
      className="flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-6 font-medium text-base text-white transition active:scale-[0.98]"
    >
      Back to recipe
    </Link>
  </main>
);

export const EditRecipeScreen = ({ recipeId }: { recipeId: string }): ReactElement => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const idResult = v.safeParse(RecipeIdSchema, recipeId);

  const recipe = useQuery({
    queryKey: ["recipes", "detail", recipeId],
    queryFn: () => {
      if (!idResult.success) throw new Error("invalid recipe id");
      return fetchRecipe(idResult.output);
    },
    enabled: idResult.success,
  });

  const update = useMutation({
    mutationFn: (input: CreateRecipeInput) => {
      if (!idResult.success) throw new Error("invalid recipe id");
      return updateRecipe(idResult.output, input);
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["recipes", "list"] });
      void qc.invalidateQueries({ queryKey: ["recipes", "detail", recipeId] });
      toast.success("Recipe updated");
      void navigate({ to: "/recipes/$recipeId", params: { recipeId: saved.id } });
    },
    onError: () => toast.error("Couldn't save changes"),
  });

  if (!idResult.success) {
    return <Notice recipeId={recipeId} title="Recipe not found" body="It may have been removed." />;
  }

  if (recipe.isPending) {
    return (
      <main className="flex h-dvh flex-col overflow-hidden bg-white">
        <div className="flex h-12 shrink-0 items-center border-slate-100 border-b px-3 pt-[env(safe-area-inset-top)]">
          <div className="font-semibold text-[15px] text-slate-900">Edit recipe</div>
        </div>
        <div className="flex-1 space-y-3 px-5 pt-4">
          <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
          <div className="h-12 w-2/3 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </main>
    );
  }

  if (recipe.isError) {
    return (
      <Notice
        recipeId={recipeId}
        title="Couldn't load this recipe"
        body="Check your connection and try again."
      />
    );
  }

  return (
    <RecipeForm
      heading="Edit recipe"
      submitLabel="Save changes"
      pending={update.isPending}
      initial={toValues(recipe.data)}
      cancelSlot={
        <Link
          to="/recipes/$recipeId"
          params={{ recipeId }}
          className="px-2 font-medium text-[15px] text-slate-500 active:text-slate-700"
        >
          Cancel
        </Link>
      }
      onSubmit={(input) => update.mutate(input)}
    />
  );
};
