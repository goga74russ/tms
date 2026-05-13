/** react-native-signature-canvas mock — exposes a Signature host element. */
import React from 'react';

const SignatureScreen = React.forwardRef((props: any, ref: any) => {
    if (ref) {
        ref.current = {
            readSignature: () => undefined,
            clearSignature: () => undefined,
            getData: () => undefined,
        };
    }
    return React.createElement('SignatureScreen', props);
});

export default SignatureScreen;
export type SignatureViewRef = {
    readSignature: () => void;
    clearSignature: () => void;
    getData: () => void;
};
