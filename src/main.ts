import './ui/styles.css';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { GameApp } from './ui/app';

const game = new GameApp();
void game.mount();

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-android');
  void NativeApp.addListener('appStateChange', state => game.setVisible(state.isActive));
  void NativeApp.addListener('backButton', () => game.handleBack());
}
