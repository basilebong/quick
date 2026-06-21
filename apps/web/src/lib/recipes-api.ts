import {
  type CreateRecipeInput,
  IngredientInputSchema,
  type Recipe,
  RecipeCategorySchema,
  type RecipeId,
  RecipeIdSchema,
  type RecipeSummary,
  StepInputSchema,
} from "@quick/app-recipes/shared";
import * as v from "valibot";

const CookSchema = v.object({ name: v.string(), initial: v.string() });

const scalarEntries = {
  id: RecipeIdSchema,
  title: v.string(),
  category: RecipeCategorySchema,
  minutes: v.number(),
  serves: v.number(),
  cook: CookSchema,
};

const SummarySchema = v.object({ ...scalarEntries, hasImage: v.boolean() });

const RecipeSchema = v.object({
  ...scalarEntries,
  description: v.string(),
  image: v.nullable(v.string()),
  ingredients: v.array(IngredientInputSchema),
  steps: v.array(StepInputSchema),
});

const ListResponseSchema = v.object({ recipes: v.array(SummarySchema) });
const RecipeEnvelopeSchema = v.object({ recipe: RecipeSchema });

const parseJson = async <T>(res: Response, schema: v.GenericSchema<unknown, T>): Promise<T> => {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  return v.parse(schema, raw);
};

export const recipeImageUrl = (id: RecipeId): string =>
  `/api/recipes/${encodeURIComponent(id)}/image`;

export const fetchRecipes = async (): Promise<RecipeSummary[]> => {
  const res = await fetch("/api/recipes", { credentials: "include" });
  const body = await parseJson(res, ListResponseSchema);
  return [...body.recipes];
};

export const fetchRecipe = async (id: RecipeId): Promise<Recipe> => {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, { credentials: "include" });
  const body = await parseJson(res, RecipeEnvelopeSchema);
  return body.recipe;
};

export const createRecipe = async (
  input: CreateRecipeInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<Recipe> => {
  const res = await fetch("/api/recipes", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
  const body = await parseJson(res, RecipeEnvelopeSchema);
  return body.recipe;
};

export const updateRecipe = async (id: RecipeId, input: CreateRecipeInput): Promise<Recipe> => {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJson(res, RecipeEnvelopeSchema);
  return body.recipe;
};

export const deleteRecipe = async (id: RecipeId): Promise<void> => {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `HTTP ${res.status}`);
  }
};
