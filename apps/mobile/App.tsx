import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MatchScreen } from './src/screens/MatchScreen';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <MatchScreen />
      <StatusBar hidden />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
