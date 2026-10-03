const defaultApiURL = 'https://giltube.gilservers.com/api/v1';

export const environment = {
  apiURL: (process.env.EXPO_PUBLIC_API_URL || defaultApiURL).replace(/\/$/, ''),
  mobileRedirectURI: 'giltube://auth/callback',
} as const;

export const mediaOrigin = environment.apiURL.replace(/\/api\/v1$/, '');
