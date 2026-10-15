import React, { useState, useEffect, useMemo } from 'react';
import {
  Image as RNImage,
  ImageProps as RNImageProps,
  ImageResizeMode,
  StyleSheet,
  View,
  Text,
  StyleProp,
  ImageStyle,
  TextStyle,
} from 'react-native';
import { optimizeCloudinaryUrl } from '@/utils/cloudinaryHelper';
import { appService } from '@/UtilServices/appHelper';

export type FastImagePriority = 'low' | 'normal' | 'high';
export type FastImageResizeMode = 'contain' | 'cover' | 'stretch' | 'center';

export interface FastImageSource {
  uri?: string | null;
  headers?: { [key: string]: string };
  priority?: FastImagePriority;
  cache?: 'immutable' | 'web' | 'cacheOnly';
}

export interface FastImageProps extends Omit<RNImageProps, 'source' | 'resizeMode'> {
  source: FastImageSource | string | number | null | undefined;
  resizeMode?: FastImageResizeMode;
  style?: StyleProp<ImageStyle>;
  autoOptimizeCloudinary?: boolean;
  fallbackLabel?: string | null;
  fallbackColor?: string;
  fallbackTextStyle?: StyleProp<TextStyle>;
  fallbackIcon?: React.ReactNode;
}

const resizeModeMap: Record<FastImageResizeMode, ImageResizeMode> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'stretch',
  center: 'center',
};

/**
 * Resolves relative URLs (e.g. /uploads/...) against backend base URL
 */
function resolveBackendUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'false' ||
    trimmed === 'N/A' ||
    trimmed === '[object Object]'
  ) {
    return null;
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const baseURL = (appService.httpClient.defaults.baseURL || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/service\/?$/, '')
    .replace(/\/+$/, '');

  const cleanUrl = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  return baseURL ? `${baseURL}/${cleanUrl}` : `/${cleanUrl}`;
}

const FastImageComponent: React.FC<FastImageProps> & {
  priority: {
    low: 'low';
    normal: 'normal';
    high: 'high';
  };
  resizeMode: {
    contain: 'contain';
    cover: 'cover';
    stretch: 'stretch';
    center: 'center';
  };
} = ({
  source,
  resizeMode = 'cover',
  style,
  autoOptimizeCloudinary = true,
  fallbackLabel,
  fallbackColor = '#3b82f6',
  fallbackTextStyle,
  fallbackIcon,
  onError,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const contentFit = resizeModeMap[resizeMode] || 'cover';

  // Extract dimensions from style to optimize Cloudinary thumbnail size dynamically
  const flatStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const styleWidth = typeof flatStyle.width === 'number' ? flatStyle.width : 100;
  const styleHeight = typeof flatStyle.height === 'number' ? flatStyle.height : 100;

  // Resolve source URL
  const resolved = useMemo(() => {
    if (!source) return { isNumeric: false, source: null, uri: null, headers: undefined };
    if (typeof source === 'number') {
      return { isNumeric: true, source, uri: null, headers: undefined };
    }

    let rawUri: string | null | undefined = null;
    let headers: { [key: string]: string } | undefined;

    if (typeof source === 'string') {
      rawUri = source;
    } else if (typeof source === 'object' && 'uri' in source) {
      rawUri = source.uri;
      if (source.headers) headers = source.headers;
    }

    const fullUrl = resolveBackendUrl(rawUri);
    if (!fullUrl) {
      return { isNumeric: false, source: null, uri: null, headers };
    }

    // Apply smart Cloudinary thumbnail optimization if applicable
    const finalUri = autoOptimizeCloudinary
      ? optimizeCloudinaryUrl(fullUrl, {
          width: Math.min(Math.round(styleWidth * 2), 800), // 2x for Retina sharpness, capped at 800
          height: Math.min(Math.round(styleHeight * 2), 800),
          crop: 'fill',
          quality: 'auto',
        })
      : fullUrl;

    return { isNumeric: false, source: null, uri: finalUri, headers };
  }, [source, autoOptimizeCloudinary, styleWidth, styleHeight]);

  useEffect(() => {
    setHasError(false);
  }, [resolved.uri]);

  // Handle fallback if URI is missing or image errored
  const shouldShowFallback = (!resolved.isNumeric && !resolved.uri) || hasError;

  if (shouldShowFallback && (fallbackLabel !== undefined || fallbackIcon !== undefined)) {
    const width = (flatStyle.width as number) || 40;
    const height = (flatStyle.height as number) || 40;
    const borderRadius =
      flatStyle.borderRadius !== undefined
        ? flatStyle.borderRadius
        : Math.min(Number(width), Number(height)) / 2;

    return (
      <View
        style={[
          style,
          {
            backgroundColor: fallbackColor,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius,
          },
        ]}
      >
        {fallbackIcon ? (
          fallbackIcon
        ) : (
          <Text
            style={[
              {
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: Math.min(Number(width), Number(height)) * 0.45,
              },
              fallbackTextStyle,
            ]}
          >
            {(fallbackLabel || 'U').trim().charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
    );
  }

  // Numeric asset source (require('./asset.png'))
  if (resolved.isNumeric && resolved.source) {
    return (
      <RNImage
        source={resolved.source}
        resizeMode={contentFit}
        style={style}
        {...props}
      />
    );
  }

  if (!resolved.uri) {
    return <View style={style} />;
  }

  return (
    <RNImage
      source={{
        uri: resolved.uri,
        headers: resolved.headers,
      }}
      resizeMode={contentFit}
      style={style}
      onError={(e) => {
        setHasError(true);
        if (typeof onError === 'function') {
          onError(e);
        }
      }}
      {...props}
    />
  );
};

FastImageComponent.priority = {
  low: 'low',
  normal: 'normal',
  high: 'high',
};

FastImageComponent.resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
};

export const FastImage = FastImageComponent;
export default FastImageComponent;
