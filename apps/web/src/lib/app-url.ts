export const appBaseUrl = (slug: string): string =>
  `${window.location.protocol}//${slug}.${window.location.host}`;

export const copyToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};
