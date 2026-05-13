/**
 * react-native mock — covers the API surface used by screens + utilities.
 *
 * Strategy: every visible component is a tiny functional component that
 * forwards children + props into a host element (the JSX tag string matches
 * the RN type name so @testing-library/react-native can pick it up via
 * `getByText` / `getByTestId` / etc.).
 *
 * Non-visual modules (Alert, Platform, Linking, AppState, etc.) are static
 * objects with the methods our code touches. Most have a `__reset` hook for
 * tests and a `__captured` field where useful.
 */
import React from 'react';

// ── helpers ──────────────────────────────────────────────────────────────
const passthrough = (name: string) => {
    const C: any = ({ children, ...rest }: any) =>
        React.createElement(name, rest, children);
    C.displayName = name;
    return C;
};

const textHost = (name: string) => {
    const C: any = ({ children, ...rest }: any) =>
        React.createElement(name, rest, children);
    C.displayName = name;
    return C;
};

// ── host components ──────────────────────────────────────────────────────
export const View = passthrough('View');
export const ScrollView = passthrough('ScrollView');
export const SafeAreaView = passthrough('SafeAreaView');
export const KeyboardAvoidingView = passthrough('KeyboardAvoidingView');
export const Modal = ({ children, visible = true, ...rest }: any) =>
    visible ? React.createElement('Modal', rest, children) : null;

export const Text = textHost('Text');

export const Image = ({ ...rest }: any) => React.createElement('Image', rest);

export const ActivityIndicator = (props: any) =>
    React.createElement('ActivityIndicator', props);

export const TouchableOpacity = ({ children, onPress, disabled, ...rest }: any) =>
    React.createElement('TouchableOpacity', { onPress, disabled, ...rest }, children);

export const TouchableHighlight = TouchableOpacity;
export const Pressable = TouchableOpacity;

export const TextInput = ({ value, onChangeText, ...rest }: any) =>
    React.createElement('TextInput', { value, onChangeText, ...rest });

export const Switch = ({ value, onValueChange, ...rest }: any) =>
    React.createElement('Switch', { value, onValueChange, ...rest });

export const RefreshControl = (props: any) =>
    React.createElement('RefreshControl', props);

export const FlatList: any = ({
    data = [],
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ...rest
}: any) => {
    const items: any[] = [];
    if (ListHeaderComponent) {
        items.push(
            React.createElement(
                React.Fragment,
                { key: '__hdr' },
                typeof ListHeaderComponent === 'function'
                    ? React.createElement(ListHeaderComponent)
                    : ListHeaderComponent
            )
        );
    }
    if (data.length === 0 && ListEmptyComponent) {
        items.push(
            React.createElement(
                React.Fragment,
                { key: '__empty' },
                typeof ListEmptyComponent === 'function'
                    ? React.createElement(ListEmptyComponent)
                    : ListEmptyComponent
            )
        );
    } else {
        data.forEach((item: any, index: number) => {
            const key = keyExtractor ? keyExtractor(item, index) : String(index);
            const rendered = renderItem ? renderItem({ item, index }) : null;
            items.push(
                React.createElement(React.Fragment, { key }, rendered)
            );
        });
    }
    if (ListFooterComponent) {
        items.push(
            React.createElement(
                React.Fragment,
                { key: '__ftr' },
                typeof ListFooterComponent === 'function'
                    ? React.createElement(ListFooterComponent)
                    : ListFooterComponent
            )
        );
    }
    return React.createElement('FlatList', rest, ...items);
};

export const SectionList = FlatList;
export const VirtualizedList = FlatList;

// ── static modules ───────────────────────────────────────────────────────
export const StyleSheet = {
    create: <T extends Record<string, any>>(s: T): T => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s),
    absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    hairlineWidth: 1,
};

let alertCalls: Array<{ title: string; message?: string; buttons?: any[] }> = [];
export const Alert = {
    alert: (title: string, message?: string, buttons?: any[]) => {
        alertCalls.push({ title, message, buttons });
    },
    __getCalls: () => alertCalls.slice(),
    __reset: () => {
        alertCalls = [];
    },
    __pressButton: (label: string) => {
        const last = alertCalls[alertCalls.length - 1];
        if (!last?.buttons) return false;
        const btn = last.buttons.find((b: any) => b.text === label);
        if (btn?.onPress) btn.onPress();
        return Boolean(btn);
    },
};

export const Platform = {
    OS: 'ios' as 'ios' | 'android' | 'web',
    Version: 17,
    select: <T,>(opts: { ios?: T; android?: T; default?: T }): T | undefined =>
        opts.ios ?? opts.default,
};

export const Dimensions = {
    get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    addEventListener: () => ({ remove: () => undefined }),
};

let linkingUrls: string[] = [];
export const Linking = {
    openURL: async (url: string) => {
        linkingUrls.push(url);
        return true;
    },
    canOpenURL: async (_url: string) => true,
    addEventListener: () => ({ remove: () => undefined }),
    __getOpened: () => linkingUrls.slice(),
    __reset: () => {
        linkingUrls = [];
    },
};

type AppStateListener = (state: 'active' | 'background' | 'inactive') => void;
const appStateListeners: AppStateListener[] = [];
export const AppState = {
    currentState: 'active' as 'active' | 'background' | 'inactive',
    addEventListener: (_evt: string, fn: AppStateListener) => {
        appStateListeners.push(fn);
        return {
            remove: () => {
                const i = appStateListeners.indexOf(fn);
                if (i >= 0) appStateListeners.splice(i, 1);
            },
        };
    },
    __emit: (state: 'active' | 'background' | 'inactive') => {
        for (const l of appStateListeners) l(state);
    },
    __reset: () => {
        appStateListeners.length = 0;
    },
};

export const Animated = {
    View,
    Text,
    ScrollView,
    Image,
    Value: class {
        _v: number;
        constructor(v: number) {
            this._v = v;
        }
        setValue(v: number) {
            this._v = v;
        }
        interpolate() {
            return this;
        }
    },
    timing: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
    spring: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
    parallel: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
    sequence: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
};

export const Keyboard = {
    dismiss: () => undefined,
    addListener: () => ({ remove: () => undefined }),
};

// Default export — RN code occasionally `import RN from 'react-native'`.
const RN = {
    View,
    ScrollView,
    SafeAreaView,
    KeyboardAvoidingView,
    Modal,
    Text,
    Image,
    ActivityIndicator,
    TouchableOpacity,
    TouchableHighlight,
    Pressable,
    TextInput,
    Switch,
    RefreshControl,
    FlatList,
    SectionList,
    VirtualizedList,
    StyleSheet,
    Alert,
    Platform,
    Dimensions,
    Linking,
    AppState,
    Animated,
    Keyboard,
};

export default RN;
