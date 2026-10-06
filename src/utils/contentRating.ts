import type { ContentRating } from '@/types/api';

// English source strings for the descriptor keys; t() translates them.
const DESCRIPTOR_LABELS: Record<string, string> = {
  violence: 'Violence',
  sex: 'Sex',
  nudity: 'Nudity',
  language: 'Strong language',
  drugs: 'Drugs',
  fear: 'Frightening scenes',
  discrimination: 'Discrimination',
};

export function contentDescriptorText(rating: ContentRating | undefined, t: (source: string) => string) {
  return (rating?.descriptors || []).filter((key) => DESCRIPTOR_LABELS[key]).map((key) => t(DESCRIPTOR_LABELS[key])).join(', ');
}
