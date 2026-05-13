/**
 * Test harness for screen-level rendering.
 *
 * Wraps a screen component in a mocked NavigationContainer surrogate and
 * injects `navigation` + `route` props that match what react-navigation's
 * native-stack would pass at runtime. Real `@react-navigation/native` is
 * NOT used — we provide a stub so tests stay synchronous and free of
 * native module surface.
 *
 * Usage:
 *   const { nav, route, ...rntl } = renderWithNav(<TripListScreen />, {
 *       params: { tripId: 't-1' },
 *   });
 *   nav.navigate.mockClear(); // jest.fn() handles ready for assertions
 *
 * The returned `nav` object has navigate/push/goBack/setOptions all as
 * jest.fn() so tests can assert on calls.
 */
import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';

export type MockNavigation = {
    navigate: jest.Mock;
    push: jest.Mock;
    goBack: jest.Mock;
    replace: jest.Mock;
    pop: jest.Mock;
    setOptions: jest.Mock;
    setParams: jest.Mock;
    addListener: jest.Mock;
    removeListener: jest.Mock;
    dispatch: jest.Mock;
    isFocused: () => boolean;
    canGoBack: () => boolean;
    getId: () => string | undefined;
    getParent: () => undefined;
    getState: () => any;
};

export type MockRoute<P extends Record<string, unknown> = Record<string, unknown>> = {
    key: string;
    name: string;
    params: P;
};

export function makeNavigation(overrides: Partial<MockNavigation> = {}): MockNavigation {
    const addListener = jest.fn(() => () => undefined);
    return {
        navigate: jest.fn(),
        push: jest.fn(),
        goBack: jest.fn(),
        replace: jest.fn(),
        pop: jest.fn(),
        setOptions: jest.fn(),
        setParams: jest.fn(),
        addListener,
        removeListener: jest.fn(),
        dispatch: jest.fn(),
        isFocused: () => true,
        canGoBack: () => true,
        getId: () => undefined,
        getParent: () => undefined,
        getState: () => ({ routes: [], index: 0 }),
        ...overrides,
    };
}

export function makeRoute<P extends Record<string, unknown>>(
    name: string,
    params: P = {} as P
): MockRoute<P> {
    return { key: `${name}-key`, name, params };
}

export interface RenderScreenOptions<P extends Record<string, unknown>> {
    routeName?: string;
    params?: P;
    navigation?: Partial<MockNavigation>;
    wrapper?: RenderOptions['wrapper'];
}

/**
 * Render a screen component as if mounted by a native-stack navigator.
 *
 * The component is invoked with `{ navigation, route }` props matching the
 * NativeStackScreenProps shape used throughout the app.
 */
export function renderWithNav<P extends Record<string, unknown> = Record<string, unknown>>(
    Component: React.ComponentType<any>,
    opts: RenderScreenOptions<P> = {}
) {
    const navigation = makeNavigation(opts.navigation);
    const route = makeRoute(opts.routeName ?? 'Test', opts.params ?? ({} as P));
    const utils = render(
        <Component navigation={navigation} route={route} />,
        { wrapper: opts.wrapper }
    );
    return { ...utils, navigation, route };
}

export default renderWithNav;
