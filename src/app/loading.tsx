import Image from "next/image";

type Props = {
    smallScreen?: boolean;
    message?: string;
}

const LoadingView = (props: Props) => {
    const imgSize = props.smallScreen ? 160 : 240;

    return (
        <div className={`loading ${props.smallScreen ? '' : 'loading-fullscreen'}`} role="status" aria-live="polite">
            {/* The GIF is animated, so it must skip image optimisation to keep playing. */}
            <Image src="/library-loading.gif" width={imgSize} height={imgSize} alt="" unoptimized priority />
            <span className="loading-sr">{props.message ? props.message : 'Loading'}</span>
        </div>
    );
};

export default LoadingView;
