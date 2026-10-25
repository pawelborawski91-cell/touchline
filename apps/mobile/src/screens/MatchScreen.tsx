import { MatchView } from '@touchline/renderer';
import { createInitialMatch } from '@touchline/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MatchInfoBar } from '../components/MatchInfoBar';
import { colors } from '../theme/colors';

export function MatchScreen() {
  const snapshot = useMemo(createInitialMatch, []);

  return (
    <View style={styles.container}>
      <MatchInfoBar snapshot={snapshot} />
      <MatchView snapshot={snapshot} style={styles.pitch} />
      <Text style={styles.status}>MATCH VIEW — RENDERING PROTOTYPE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 44,
    paddingTop: 8,
    paddingBottom: 6,
  },
  pitch: {
    flex: 1,
    borderRadius: 10,
  },
  status: {
    marginTop: 6,
    alignSelf: 'center',
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
