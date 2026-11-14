import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, View } from 'react-native';

import { geelsAPI, type GeelSound } from '@/api/geels';
import { GeelRecorder } from '@/geels/create/GeelRecorder';
import { GeelReview } from '@/geels/create/GeelReview';
import { deleteDraft, loadDraft, saveDraft, type DraftClip } from '@/geels/create/drafts';
import { SoundPicker } from '@/geels/create/SoundPicker';
import { useI18n } from '@/i18n';
import { useMusicPlayer } from '@/music/MusicPlayerProvider';
import { usePlayer } from '@/player/PlayerProvider';

export default function CreateGeelScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ sound?: string }>();
  const music = useMusicPlayer();
  const videoPlayer = usePlayer();
  const [step, setStep] = useState<'record' | 'review'>('record');
  const [clips, setClipsState] = useState<DraftClip[]>([]);
  const [maxSeconds, setMaxSeconds] = useState(60);
  const [sound, setSound] = useState<GeelSound | null>(null);
  const [soundStartMS, setSoundStartMS] = useState(0);
  const [soundVolume, setSoundVolume] = useState(1);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [caption, setCaption] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const clipsRef = useRef<DraftClip[]>([]);
  const setClips = (update: (current: DraftClip[]) => DraftClip[]) => setClipsState((current) => {
    const next = update(current);
    clipsRef.current = next;
    return next;
  });

  // Quiet the rest of the app while recording.
  const pausedOnce = useRef(false);
  useEffect(() => {
    if (pausedOnce.current) return;
    pausedOnce.current = true;
    if (music.playing) music.pause();
    if (videoPlayer.player.playing) videoPlayer.player.pause();
  }, [music, videoPlayer.player]);

  // Opened from a sound page: start with that sound.
  useEffect(() => {
    if (!params.sound) return;
    void geelsAPI.sound(params.sound).then((data) => { if (data.usable) setSound(data.sound); }).catch(() => undefined);
  }, [params.sound]);

  // Offer to pick up where the last draft left off.
  useEffect(() => {
    const draft = loadDraft();
    if (!draft || params.sound) return;
    Alert.alert(t('Continue your draft?'), t('You have an unfinished Geel.'), [
      { text: t('Discard'), style: 'destructive', onPress: deleteDraft },
      { text: t('Continue'), onPress: () => {
        setClips(() => draft.clips);
        setSound(draft.sound);
        setSoundStartMS(draft.soundStartMS);
        setSoundVolume(draft.soundVolume);
        setOriginalVolume(draft.originalVolume);
        setMaxSeconds(draft.maxSeconds);
        setCaption(draft.caption);
      } },
    ]);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeRecordings = (list: DraftClip[]) => {
    for (const clip of list) {
      if (clip.imported) continue;
      try { new File(clip.uri).delete(); } catch { /* already gone */ }
    }
  };

  const leave = () => {
    const current = clipsRef.current;
    if (!current.length) { router.back(); return true; }
    Alert.alert(t('Leave the creator?'), t('Save your clips as a draft to finish later.'), [
      { text: t('Keep editing'), style: 'cancel' },
      { text: t('Discard'), style: 'destructive', onPress: () => { removeRecordings(current); deleteDraft(); router.back(); } },
      { text: t('Save draft'), onPress: () => void saveDraft({ clips: current, sound, soundStartMS, soundVolume, originalVolume, maxSeconds, caption })
        .then(() => router.back())
        .catch((error) => Alert.alert(t('Couldn’t save the draft'), error instanceof Error ? error.message : t('Please try again.'))) },
    ]);
    return true;
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'review') { setStep('record'); return true; }
      return leave();
    });
    return () => subscription.remove();
  });

  const posted = () => {
    removeRecordings(clipsRef.current);
    deleteDraft();
    clipsRef.current = [];
    Alert.alert(t('Your Geel is on its way'), t('It will appear on your channel and in Geels once it finishes processing.'));
    router.replace('/(tabs)/geels');
  };

  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <StatusBar style="light" hidden={step === 'record'} />
    {step === 'record'
      ? <GeelRecorder
        clips={clips}
        setClips={setClips}
        maxSeconds={maxSeconds}
        setMaxSeconds={setMaxSeconds}
        sound={sound}
        soundStartMS={soundStartMS}
        onPickSound={() => setPickerOpen(true)}
        onNext={() => setStep('review')}
        onClose={leave}
      />
      : <GeelReview
        clips={clips}
        sound={sound}
        soundStartMS={soundStartMS} setSoundStartMS={setSoundStartMS}
        soundVolume={soundVolume} setSoundVolume={setSoundVolume}
        originalVolume={originalVolume} setOriginalVolume={setOriginalVolume}
        caption={caption} setCaption={setCaption}
        onBack={() => setStep('record')}
        onPickSound={() => setPickerOpen(true)}
        onPosted={posted}
      />}
    <SoundPicker visible={pickerOpen} selected={sound} onClose={() => setPickerOpen(false)} onSelect={(next) => { setSound(next); setSoundStartMS(0); }} />
  </View>;
}
