type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyPayloadGIF = {
  id?: string;
  title?: string;
  images?: { fixed_height?: GiphyImage; downsized?: GiphyImage; original?: GiphyImage };
};
export interface GiphyGIF { id: string; title: string; previewURL: string; originalURL: string }
const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY || 'fBgnR8ZpNiFdTN0b3FC3gEKTpg9tBztr';

async function request(path: 'search' | 'trending', query = '') {
  const queryPart = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';
  const response = await fetch(`https://api.giphy.com/v1/gifs/${path}?api_key=${encodeURIComponent(apiKey)}&limit=24&rating=g${queryPart}`);
  const payload = await response.json() as { data?: GiphyPayloadGIF[]; meta?: { msg?: string } };
  if (!response.ok) throw new Error(payload.meta?.msg || 'Could not load GIFs.');
  return (payload.data || []).flatMap((gif) => {
    const id = String(gif.id || '').trim();
    const previewURL = gif.images?.fixed_height?.url || gif.images?.downsized?.url || gif.images?.original?.url || '';
    const originalURL = gif.images?.original?.url || gif.images?.downsized?.url || previewURL;
    return id && previewURL && originalURL ? [{ id, title: gif.title || 'GIF', previewURL, originalURL }] : [];
  });
}
export const giphyAPI = { trending: () => request('trending'), search: (query: string) => request('search', query) };
