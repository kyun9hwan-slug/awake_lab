export type DiscountType = "none" | "dankook" | "company" | "saeeden" | "custom";

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ServiceKey =
  | "practice"
  | "recording"
  | "recording_filming";

export interface ServiceOption {
  key: ServiceKey;
  label: string;
  description: string;
  hourlyRate: number;
}

export interface SiteConfig {
  siteName: string;
  heroImages: string[];
  heroTitle: string;
  heroSubtitle: string;
  equipmentItems: string[];
  openHour: number;
  closeHour: number;
  fridayClosedFromHour: number;
  saturdayClosed: boolean;
  holdMinutes: number;
  minBookingHours: number;
  includedPeople: number;
  extraPersonFee: number;
  discountRate: number;
  engineerHourlyRate: number;
  afterHoursInquiryMessage: string;
  requiredNotices: string[];
  services: ServiceOption[];
}

export const defaultConfig: SiteConfig = {
  siteName: "Awake Lab",
  heroImages: [
    "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=80",
  ],
  heroTitle: "AWAKE LAB",
  heroSubtitle:
    "같은 호흡으로 합주하고 같은 호흡으로 녹음할 수 있는 공간",
  equipmentItems: [
    "콘솔 : 베링거 X32 컴팩트",
    "디지털 스네이크 : 마이다스 DL32",
    "드럼 : ",
    "기타 앰프 : 펜더",
    "베이스 앰프 : 에쉬다운",
    "건반 : ",
    "마이크",
  ],
  openHour: 9,
  closeHour: 20,
  fridayClosedFromHour: 18,
  saturdayClosed: true,
  holdMinutes: 5,
  minBookingHours: 2,
  includedPeople: 10,
  extraPersonFee: 10000,
  discountRate: 0.1,
  engineerHourlyRate: 100000,
  afterHoursInquiryMessage: "시간이 보이지 않는다면 예약이 불가한 시간입니다.",
  requiredNotices: [
    "취사 금지",
    "현금영수증 요청시 + 10% 부가세 발생",
    "오후 8시 이후 예약 관련 문의는 관리자에게 직접 문의해 주세요.",
    "화기 엄금",
    "기입된 인원 외 출입 금지",
    "음식물/ 주류 반입 금지",
    "반려견 등 동물 출입 금지",
    "하드락, 헤비메탈류의 음악팀 사용불가 (트윈 패달, 그로울링 보컬 등 사용 금지)",
    "최소 10분전에는 다음 예약자를 위해 정리 부탁드립니다.",
    "CCTV 촬영중, 녹화본을 근거로 도난과 훼손 등 관련한 민형사상의 책임을 질수 있습니다.",
  ],
  services: [
    {
      key: "practice",
      label: "음악 연습(합주)",
      description: "기본 합주와 팀 연습에 적합한 공간입니다.",
      hourlyRate: 60000,
    },
    {
      key: "recording",
      label: "음악 연습(합주) + 녹음",
      description: "녹음 시 콘솔을 통한 멀티트랙 제공이므로 별도 컴퓨터와 소프트웨어는 지참하셔야 합니다. 없으신 경우 엔지니어 추가로 진행해 주셔야 합니다.",
      hourlyRate: 100000,
    },
    {
      key: "recording_filming",
      label: "음악 연습(합주) + 녹음 + 촬영",
      description: "녹음과 촬영을 함께 진행하는 복합 이용 상품입니다. 녹음 장비(PC/SW) 미지참 시 엔지니어 추가가 필요합니다.",
      hourlyRate: 200000,
    },
  ],
};

export const discountLabels: Record<Exclude<DiscountType, "none">, string> = {
  dankook: "죽전 단국대학교 동아리",
  company: "인근 회사 사업체 할인",
  saeeden: "용인 새에덴교회 부서",
  custom: "할인 코드",
};

export const blockingStatuses: BookingStatus[] = ["pending", "approved"];
