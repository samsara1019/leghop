import type { PlaceCategory } from '../db/schema'

export interface CategoryMeta {
  label: string
  emoji: string
  /** 지도 핀 색 */
  color: string
}

export const CATEGORIES: Record<PlaceCategory, CategoryMeta> = {
  lodging: { label: '숙소', emoji: '🏨', color: '#8b5cf6' },
  food: { label: '맛집', emoji: '🍽️', color: '#f97316' },
  sight: { label: '관광지', emoji: '📷', color: '#0ea5e9' },
  shop: { label: '쇼핑', emoji: '🛍️', color: '#ec4899' },
  transport: { label: '교통', emoji: '🚉', color: '#64748b' },
  custom: { label: '기타', emoji: '📍', color: '#22c55e' },
}

export const CATEGORY_ORDER: PlaceCategory[] = [
  'lodging',
  'food',
  'sight',
  'shop',
  'transport',
  'custom',
]

/**
 * Google place type → 우리 카테고리.
 * 앞에 있는 규칙이 이긴다 (types 배열은 구체적인 것부터 오는 편이지만 보장은 없다).
 */
const RULES: [PlaceCategory, string[]][] = [
  [
    'lodging',
    ['lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'resort_hotel', 'bed_and_breakfast', 'campground'],
  ],
  [
    'transport',
    ['airport', 'international_airport', 'train_station', 'subway_station', 'bus_station', 'transit_station', 'light_rail_station', 'ferry_terminal', 'car_rental'],
  ],
  [
    'food',
    ['restaurant', 'cafe', 'coffee_shop', 'bar', 'bakery', 'food', 'meal_takeaway', 'meal_delivery', 'ice_cream_shop', 'wine_bar', 'pub'],
  ],
  [
    'sight',
    ['tourist_attraction', 'museum', 'art_gallery', 'park', 'church', 'place_of_worship', 'historical_landmark', 'historical_place', 'monument', 'zoo', 'aquarium', 'observation_deck', 'plaza', 'national_park', 'beach'],
  ],
  [
    'shop',
    ['store', 'shopping_mall', 'clothing_store', 'department_store', 'market', 'supermarket', 'book_store', 'gift_shop', 'convenience_store'],
  ],
]

export function inferCategory(types: readonly string[] = []): PlaceCategory {
  for (const [category, keys] of RULES) {
    if (types.some((t) => keys.includes(t))) return category
  }
  return 'custom'
}
