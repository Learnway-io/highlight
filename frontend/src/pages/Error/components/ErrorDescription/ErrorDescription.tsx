import JsonOrTextCard from '@pages/Error/components/JsonOrTextCard/JsonOrTextCard';
import React from 'react';

import {
    ErrorGroup,
    ErrorObject,
    Maybe,
} from '../../../../graph/generated/schemas';

interface Props {
    errorGroup: Maybe<Pick<ErrorGroup, 'event'>> | undefined;
    errorObject?: ErrorObject;
}

const ErrorDescription = ({ errorGroup, errorObject }: Props) => {
    const event = errorObject?.event ?? errorGroup?.event;
    const jsonOrText = formatErrorDescription(event);
    return (
        <JsonOrTextCard
            jsonOrText={jsonOrText.toString()}
            title={'Error Body'}
        />
    );
};

export default ErrorDescription;

const formatErrorDescription = (rawEvent: any) => {
    let event = rawEvent;

    if (event.length === 1) {
        const firstEvent = event[0];
        if (firstEvent) {
            if (
                firstEvent[0] === '"' &&
                firstEvent[firstEvent.length - 1] === '"'
            ) {
                event = firstEvent.slice(1, -1);

                return event;
            }
        }
    }
    const textToRender = `[${event}]`;
    let isJson = true;

    try {
        JSON.parse(textToRender);
    } catch {
        isJson = false;
    }

    if (isJson) {
        return textToRender;
    }

    return rawEvent || '';
};
