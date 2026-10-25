// GENERATED from OpenStreetMap route.txt data
import type { RailLine } from '../types'
import path from '../data/MY-MR.json'

const MR: RailLine = {
  id: 'MY-MR',
  code: 'MR',
  name: "KL Monorail",
  country: 'MY',
  type: 'Monorail',
  operator: "Rapid Rail",
  color: '#7dba00',
  stations: [
  {
    "code": "MR1",
    "name": "KL Sentral (Monorail)",
    "coordinates": [
      101.6879,
      3.13268
    ]
  },
  {
    "code": "MR2",
    "name": "Tun Sambanthan",
    "coordinates": [
      101.69086,
      3.13145
    ]
  },
  {
    "code": "MR3",
    "name": "Maharajalela",
    "coordinates": [
      101.6992,
      3.13895
    ]
  },
  {
    "code": "MR4",
    "name": "Hang Tuah",
    "coordinates": [
      101.70602,
      3.14069
    ]
  },
  {
    "code": "MR5",
    "name": "Imbi",
    "coordinates": [
      101.70945,
      3.14281
    ]
  },
  {
    "code": "MR6",
    "name": "Bukit Bintang (Monorail)",
    "coordinates": [
      101.71149,
      3.14607
    ]
  },
  {
    "code": "MR7",
    "name": "Raja Chulan",
    "coordinates": [
      101.71042,
      3.15083
    ]
  },
  {
    "code": "MR8",
    "name": "Bukit Nanas",
    "coordinates": [
      101.70483,
      3.15614
    ]
  },
  {
    "code": "MR9",
    "name": "Medan Tuanku",
    "coordinates": [
      101.6989,
      3.15925
    ]
  },
  {
    "code": "MR10",
    "name": "Chow Kit",
    "coordinates": [
      101.69838,
      3.16739
    ]
  },
  {
    "code": "MR11",
    "name": "Titiwangsa",
    "coordinates": [
      101.69595,
      3.17323
    ]
  }
],
  path: path as [number, number][][],
}

export default MR
