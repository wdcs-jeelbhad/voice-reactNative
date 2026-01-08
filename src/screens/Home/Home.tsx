import type { RootScreenProps } from '@/navigation/types';

import { Text, TouchableOpacity, View } from 'react-native';

import { Paths } from '@/navigation/paths';
import { useTheme } from '@/theme';

import { SafeScreen } from '@/components/templates';

function Home({ navigation }: RootScreenProps<Paths.Home>) {
  const { fonts, layout } = useTheme();

  return (
    <SafeScreen>
      <View
        style={[
          layout.flex_1,
          layout.col,
          layout.itemsCenter,
          layout.justifyCenter,
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate(Paths.Notes)}
          style={[
            {
              backgroundColor: '#007AFF',
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 8,
            },
          ]}
        >
          <Text style={[fonts.size_16, { color: '#FFFFFF' }]}>Test</Text>
        </TouchableOpacity>
      </View>
    </SafeScreen>
  );
}

export default Home;

