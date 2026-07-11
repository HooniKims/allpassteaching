# 2022 Revised National Curriculum Index

이 폴더는 `2022_교육과정_모음`의 PDF 교육과정을 챗봇 개발자가 읽기 쉬운 Markdown 자료로 재정리한 것입니다.

## Folder Structure

- `documents/`: PDF별 정리 Markdown. 파일명은 영문입니다.
- `file_name_crosswalk.csv`: 원본 한글 파일명과 영문 산출물 파일명 매핑입니다.
- `manifest.json`: 프로그램에서 읽기 쉬운 메타데이터입니다.

## Naming Rule

- `book_XX_english_title.md` 형식입니다.
- 고시 버전이나 수정본이 파일명에 드러나는 경우 `_notice_2026_1`, `_notice_2024_3`, `_revised_copy`를 붙였습니다.
- 같은 SHA-256 해시를 가진 완전 중복 PDF는 별도 alias 문서를 만들고 canonical 문서를 가리키게 했습니다.

## Documents

| Book | Korean title | Category | Output file | Source file | Duplicate of |
|---:|---|---|---|---|---|
| 1 | 총론 | national_common | `documents/book_01_general_guidelines_notice_2026_1.md` | (2022 개정) 초·중등학교 교육과정 [별책1] 총론_ 국가교육위원회 고시 제2026-1호(2026.1.21.).pdf |  |
| 4 | 고등학교 | school_level | `documents/book_04_high_school_curriculum_notice_2026_1.md` | (2022 개정) 초·중등학교 교육과정 [별책4] 고등학교_ 국가교육위원회 제2026-1호(2026.1.21.).pdf |  |
| 5 | 국어과 | common_subject | `documents/book_05_korean_language_curriculum.md` | [별책5] 국어과 교육과정.pdf |  |
| 6 | 도덕과 | common_subject | `documents/book_06_moral_education_curriculum.md` | [별책6] 도덕과 교육과정.pdf |  |
| 7 | 사회과 | common_subject | `documents/book_07_social_studies_curriculum.md` | [별책7] 사회과 교육과정.pdf |  |
| 8 | 수학과 | common_subject | `documents/book_08_mathematics_curriculum.md` | [별책8] 수학과 교육과정.pdf |  |
| 9 | 과학과 | common_subject | `documents/book_09_science_curriculum.md` | [별책9] 과학과 교육과정.pdf |  |
| 10 | 실과(기술가정)정보과 | common_subject | `documents/book_10_practical_arts_technology_home_economics_and_informatics_curriculum.md` | [별책10] 실과(기술가정)정보과 교육과정.pdf |  |
| 11 | 체육과 | common_subject | `documents/book_11_physical_education_curriculum.md` | [별책11] 체육과 교육과정.pdf |  |
| 12 | 음악과 | common_subject | `documents/book_12_music_curriculum.md` | [별책12] 음악과 교육과정.pdf |  |
| 13 | 미술과 | common_subject | `documents/book_13_art_curriculum.md` | [별책13] 미술과 교육과정.pdf |  |
| 14 | 영어과 | common_subject | `documents/book_14_english_curriculum.md` | [별책14] 영어과 교육과정.pdf |  |
| 15 | 바른 생활, 슬기로운 생활, 즐거운 생활 | elementary_integrated_subject | `documents/book_15_integrated_subjects_curriculum.md` | [별책15] 바른 생활, 슬기로운 생활, 즐거운 생활 교육과정.pdf |  |
| 17 | 한문과 | common_subject | `documents/book_17_classical_chinese_curriculum.md` | [별책17] 한문과 교육과정.pdf |  |
| 18 | 중학교 선택 교과 | middle_school_elective | `documents/book_18_middle_school_elective_subjects_curriculum.md` | [별책18] 중학교 선택 교과 교육과정.pdf |  |
| 18 | 중학교 선택 교과 | middle_school_elective | `documents/book_18_middle_school_elective_subjects_curriculum_duplicate_copy_1.md` | [별책18] 중학교 선택 교과 교육과정 (1).pdf | book_18_middle_school_elective_subjects_curriculum.md |
| 18 | 중학교 선택 교과 | middle_school_elective | `documents/book_18_middle_school_elective_subjects_curriculum_duplicate_copy_2.md` | [별책18] 중학교 선택 교과 교육과정 (2).pdf | book_18_middle_school_elective_subjects_curriculum.md |
| 18 | 중학교 선택 교과 | middle_school_elective | `documents/book_18_middle_school_elective_subjects_curriculum_notice_2024_3.md` | (2022개정) 초·중등학교 교육과정 [별책18] 중학교 선택교과_국가교육위원회 고시 제2024-3호(2024.08.16.).pdf |  |
| 19 | 고등학교 교양 교과 | high_school_liberal_arts | `documents/book_19_high_school_liberal_arts_curriculum_notice_2024_3.md` | (2022개정) 초·중등학교 교육과정 [별책19] 고등학교 교양 교과_국가교육위원회 고시 제2024-3호(2024.08.16.).pdf |  |
| 19 | 고등학교 교양 교과 | high_school_liberal_arts | `documents/book_19_high_school_liberal_arts_curriculum_revised_copy.md` | [별책19] 고등학교 교양 교과 교육과정_국가교육위원회고시제2024-3호(2024.08.16.)_수정.pdf |  |
| 20 | 과학 계열 선택 과목 | specialized_elective | `documents/book_20_science_specialized_elective_subjects_curriculum.md` | [별책20] 과학 계열 선택 과목 교육과정.pdf |  |
| 21 | 체육 계열 선택 과목 | specialized_elective | `documents/book_21_physical_education_specialized_elective_subjects_curriculum.md` | [별책21] 체육 계열 선택 과목 교육과정.pdf |  |
| 22 | 예술 계열 선택 교과 | specialized_elective | `documents/book_22_arts_specialized_elective_subjects_curriculum.md` | [별책22] 예술 계열 선택 교과 교육과정.pdf |  |
| 23 | 경영·금융 전문 교과 | professional_subject | `documents/book_23_business_and_finance_professional_curriculum.md` | [별책23] 경영·금융 전문 교과 교육과정.pdf |  |
| 24 | 보건·복지 전문 교과 | professional_subject | `documents/book_24_health_and_welfare_professional_curriculum.md` | [별책24] 보건·복지 전문 교과 교육과정.pdf |  |
| 25 | 문화·예술·디자인·방송 전문 교과 | professional_subject | `documents/book_25_culture_arts_design_and_broadcasting_professional_curriculum.md` | [별책25] 문화·예술·디자인·방송 전문 교과 교육과정.pdf |  |
| 26 | 미용 전문 교과 | professional_subject | `documents/book_26_beauty_professional_curriculum.md` | [별책26] 미용 전문 교과 교육과정.pdf |  |
| 27 | 관광·레저 전문 교과 | professional_subject | `documents/book_27_tourism_and_leisure_professional_curriculum.md` | [별책27] 관광·레저 전문 교과 교육과정.pdf |  |
| 28 | 식품·조리 전문 교과 | professional_subject | `documents/book_28_food_and_culinary_professional_curriculum.md` | [별책28] 식품·조리 전문 교과 교육과정.pdf |  |
| 29 | 건축·토목 전문 교과 | professional_subject | `documents/book_29_architecture_and_civil_engineering_professional_curriculum.md` | [별책29] 건축·토목 전문 교과 교육과정.pdf |  |
| 30 | 기계 전문 교과 | professional_subject | `documents/book_30_machinery_professional_curriculum.md` | [별책30] 기계 전문 교과 교육과정.pdf |  |
| 31 | 재료 전문 교과 | professional_subject | `documents/book_31_materials_professional_curriculum.md` | [별책31] 재료 전문 교과 교육과정.pdf |  |
| 32 | 화학 공업 전문 교과 | professional_subject | `documents/book_32_chemical_industry_professional_curriculum.md` | [별책32] 화학 공업 전문 교과 교육과정.pdf |  |
| 33 | 섬유·의류 전문 교과 | professional_subject | `documents/book_33_textile_and_clothing_professional_curriculum.md` | [별책33] 섬유·의류 전문 교과 교육과정.pdf |  |
| 34 | 전기·전자 전문 교과 | professional_subject | `documents/book_34_electrical_and_electronic_professional_curriculum.md` | [별책34] 전기·전자 전문 교과 교육과정.pdf |  |
| 35 | 정보·통신 전문 교과 | professional_subject | `documents/book_35_information_and_communication_professional_curriculum.md` | [별책35] 정보·통신 전문 교과 교육과정.pdf |  |
| 36 | 환경·안전·소방 전문 교과 | professional_subject | `documents/book_36_environment_safety_and_firefighting_professional_curriculum.md` | [별책36] 환경·안전·소방 전문 교과 교육과정.pdf |  |
| 37 | 농림·축산 전문 교과 | professional_subject | `documents/book_37_agriculture_forestry_and_livestock_professional_curriculum.md` | [별책37] 농림·축산 전문 교과 교육과정.pdf |  |
| 38 | 수산·해운 전문 교과 | professional_subject | `documents/book_38_fisheries_and_maritime_professional_curriculum.md` | [별책38] 수산·해운 전문 교과 교육과정.pdf |  |
| 39 | 융복합·지식 재산 전문 교과 | professional_subject | `documents/book_39_convergence_and_intellectual_property_professional_curriculum.md` | [별책39] 융복합·지식 재산 전문 교과 교육과정.pdf |  |
