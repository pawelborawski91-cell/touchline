import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PlaceholderScreen } from './src/screens/PlaceholderScreen';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <PlaceholderScreen />
      <StatusBar hidden />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
