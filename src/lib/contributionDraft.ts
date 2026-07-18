export interface ContributionDraft {
  active: true;
  dishName: string;
  dishDescription: string;
  pickerActive: boolean;
  updatedAt: number;
}

export function contributionDraftKey(restaurantId: string): string {
  return `seefood-contribution-draft:${restaurantId}`;
}

export function parseContributionDraft(value: string | null): ContributionDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ContributionDraft>;
    if (parsed.active !== true) return null;
    return {
      active: true,
      dishName: typeof parsed.dishName === "string" ? parsed.dishName : "",
      dishDescription: typeof parsed.dishDescription === "string" ? parsed.dishDescription : "",
      pickerActive: parsed.pickerActive === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}
