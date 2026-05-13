/** react-native-safe-area-context mock — just renders children. */
import React from 'react';

export const SafeAreaView = ({ children, ...rest }: any) =>
    React.createElement('SafeAreaView', rest, children);

export const SafeAreaProvider = ({ children }: any) =>
    React.createElement('SafeAreaProvider', null, children);

export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 375, height: 812 });
