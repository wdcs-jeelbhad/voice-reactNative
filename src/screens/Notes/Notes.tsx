import type { RootScreenProps } from '@/navigation/types';

import { View } from 'react-native';

import { Paths } from '@/navigation/paths';
import { useTheme } from '@/theme';

import { SafeScreen } from '@/components/templates';

function Notes({}: RootScreenProps<Paths.Notes>) {
  const { layout } = useTheme();

  return (
    <SafeScreen>
      <View style={[layout.flex_1]} />
    </SafeScreen>
  );
}

export default Notes;

