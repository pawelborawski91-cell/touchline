import { StyleSheet, Text, View } from 'react-native';

import { PlaceholderPitch } from '../components/PlaceholderPitch';
import { PLACEHOLDER_LINEUP } from '../components/placeholderLineup';
import { TokenLayer } from '../components/TokenLayer';
import { colors } from '../theme/colors';

export function PlaceholderScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TOUCHLINE</Text>
        <Text style={styles.label}>SPRINT 0 — FOUNDATION</Text>
      </View>
      <PlaceholderPitch>
        <TokenLayer tokens={PLACEHOLDER_LINEUP} />
      </PlaceholderPitch>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 48,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
  },
  label: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
