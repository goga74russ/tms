/** expo-camera mock. Tests can override permission via __setPermission(). */
import React from 'react';

let permission: { granted: boolean; canAskAgain: boolean; status: string } = {
    granted: true,
    canAskAgain: true,
    status: 'granted',
};

export const CameraView = React.forwardRef(
    ({ children, ...rest }: any, ref: any) => {
        if (ref) {
            ref.current = {
                takePictureAsync: async () => ({ uri: 'file:///mock/photo.jpg' }),
            };
        }
        return React.createElement('CameraView', rest, children);
    }
);

export function useCameraPermissions(): [
    typeof permission,
    () => Promise<typeof permission>
] {
    const [p, setP] = React.useState(permission);
    const request = async () => {
        const next = { granted: true, canAskAgain: true, status: 'granted' };
        permission = next;
        setP(next);
        return next;
    };
    return [p, request];
}

export const __setPermission = (next: Partial<typeof permission>) => {
    permission = { ...permission, ...next };
};

export const __reset = () => {
    permission = { granted: true, canAskAgain: true, status: 'granted' };
};
