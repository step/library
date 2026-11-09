import React, { memo } from 'react';
import "../styles/Manage.css";

type Props = {
    title: string;
    message: string;
}

/** Blocking loader shown while a request is in flight. */
const LoaderOverlay = memo((props: Props) => {
    return (
        <div className="mg-block" role="alert" aria-busy="true">
            <div className="mg-block-card">
                <span className="mg-spin" aria-hidden="true"></span>
                <span className="mg-block-t">{props.title}</span>
                <span className="mg-block-s">{props.message}</span>
            </div>
        </div>
    );
});

LoaderOverlay.displayName = 'LoaderOverlay';

export default LoaderOverlay;
