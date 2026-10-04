import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const TICKER_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c'];

export const ActivityTicker = ({ activities }: { activities: any[] }) => {
  const animatedValue = useRef(new Animated.Value(width)).current;
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth > 0) {
      animatedValue.setValue(width);
      Animated.loop(
        Animated.timing(animatedValue, {
          toValue: -contentWidth,
          duration: (width + contentWidth) * 15,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [contentWidth, animatedValue]);

  if (activities.length === 0) {
    return (
      <View style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: '700' }}>
          No activities found.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        overflow: 'hidden',
        paddingVertical: 4,
        justifyContent: 'center',
        backgroundColor: '#e2e8f0',
        borderRadius: 12,
      }}
    >
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            transform: [{ translateX: animatedValue }],
          }}
        >
          {activities.map((act: any, idx: number) => {
            const color = TICKER_COLORS[idx % TICKER_COLORS.length];
            return (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="person-circle" size={22} color={color} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: color }}>
                  {act.leadName}{' '}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#334155' }}>
                  — {act.action}{' '}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748b', marginLeft: 6 }}>
                  ({act.byUser} @{' '}
                  {new Date(act.date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  )
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '900',
                    color: '#94a3b8',
                    marginHorizontal: 30,
                  }}
                >
                  *
                </Text>
              </View>
            );
          })}
        </Animated.View>
      </ScrollView>
    </View>
  );
};
