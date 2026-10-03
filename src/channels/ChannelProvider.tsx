import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { giltubeAPI } from '@/api/giltube';
import { useAuth } from '@/auth/AuthProvider';
import type { Channel, UserChannelsResponse } from '@/types/api';

interface ChannelContextValue {
  channels: Channel[];
  activeChannel: Channel | null;
  activeChannelID: string;
  isLoading: boolean;
  switchChannel: (channelID: string) => Promise<void>;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: React.PropsWithChildren) {
  const { account, status } = useAuth();
  const queryClient = useQueryClient();
  const [selectedID, setSelectedID] = useState('');
  const signedIn = status === 'signedIn' && !!account;
  const query = useQuery({
    queryKey: ['my-channels', account?.id],
    queryFn: () => giltubeAPI.userChannels(account!.id),
    enabled: signedIn,
  });
  const channels = useMemo(() => query.data?.channels || [], [query.data?.channels]);
  const activeChannelID = channels.some((channel) => channel.id === selectedID)
    ? selectedID
    : query.data?.default_channel_id || channels[0]?.id || '';
  const activeChannel = channels.find((channel) => channel.id === activeChannelID) || null;

  const switchChannel = useCallback(async (channelID: string) => {
    if (!channels.some((channel) => channel.id === channelID)) throw new Error('That channel is not available on this account.');
    await giltubeAPI.setDefaultChannel(channelID);
    setSelectedID(channelID);
    queryClient.setQueryData<UserChannelsResponse>(['my-channels', account?.id], (current) => current ? { ...current, default_channel_id: channelID } : current);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription'] }),
      queryClient.invalidateQueries({ queryKey: ['liked'] }),
      queryClient.invalidateQueries({ queryKey: ['comments'] }),
    ]);
  }, [account?.id, channels, queryClient]);

  const value = useMemo(() => ({ channels, activeChannel, activeChannelID, isLoading: query.isLoading, switchChannel }), [activeChannel, activeChannelID, channels, query.isLoading, switchChannel]);
  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useActiveChannel() {
  const context = useContext(ChannelContext);
  if (!context) throw new Error('useActiveChannel must be used within ChannelProvider');
  return context;
}
