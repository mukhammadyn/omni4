/**
 * Шаблоны опросов — `SRV.TPL` прототипа (surveys.html, `#tpl`).
 * Содержимое — по-русски, как в прототипе: вопросы шаблона не переводятся,
 * их правят в конструкторе после выбора. `type` — значение PICK_LIST
 * `hr_surveys.type`.
 */
import type { Definition } from "./survey";

export type SurveyTemplate = { key: string; title: string; description: string; type: string; definition: Definition };

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: "blank",
    title: "Пустой опрос",
    description: "Начните с чистого листа в конструкторе",
    type: "survey",
    definition: {
      title: "Новый опрос",
      pages: [
        {
          name: "p1",
          elements: []
        }
      ]
    }
  },
  {
    key: "enps",
    title: "eNPS",
    description: "Индекс лояльности сотрудников, шкала 0–10",
    type: "enps",
    definition: {
      title: "eNPS — III квартал 2026",
      description: "Анонимный опрос. Займёт около 2 минут.",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "rating",
              name: "enps",
              title: "Насколько вероятно, что вы порекомендуете компанию как место работы друзьям?",
              rateMin: 0,
              rateMax: 10,
              isRequired: true,
              minRateDescription: "Точно нет",
              maxRateDescription: "Обязательно"
            },
            {
              type: "checkbox",
              name: "motivation",
              title: "Что больше всего мотивирует вас в работе?",
              choices: [
                "Интересные задачи",
                "Команда",
                "Зарплата и бонусы",
                "Гибкий график",
                "Обучение и рост",
                "Руководитель"
              ],
              maxSelectedChoices: 3,
              description: "Не более трёх вариантов"
            },
            {
              type: "comment",
              name: "improve",
              title: "Что нам стоит улучшить в первую очередь?"
            }
          ]
        }
      ]
    }
  },
  {
    key: "pulse",
    title: "Пульс-опрос",
    description: "Короткий еженедельный замер настроения",
    type: "pulse",
    definition: {
      title: "Пульс-опрос: неделя",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "rating",
              name: "mood",
              title: "Как вы оцениваете прошедшую неделю?",
              rateType: "smileys",
              isRequired: true
            },
            {
              type: "boolean",
              name: "blocked",
              title: "Были ли блокеры в работе?",
              labelTrue: "Да",
              labelFalse: "Нет"
            },
            {
              type: "text",
              name: "one",
              title: "Одно слово о неделе"
            }
          ]
        }
      ]
    }
  },
  {
    key: "work",
    title: "Условия труда",
    description: "Рабочее место, нагрузка, пожелания",
    type: "engagement",
    definition: {
      title: "Удовлетворённость условиями труда 2026",
      description: "Помогите сделать офис и процессы удобнее.",
      pages: [
        {
          name: "office",
          title: "Рабочее место",
          elements: [
            {
              type: "rating",
              name: "comfort",
              title: "Оцените комфорт рабочего места",
              isRequired: true
            },
            {
              type: "dropdown",
              name: "lunch",
              title: "Какой формат обеда вам удобнее?",
              choices: [
                "Кафе в офисе",
                "Компенсация",
                "Доставка",
                "Свой обед"
              ]
            }
          ]
        },
        {
          name: "load",
          title: "Нагрузка",
          elements: [
            {
              type: "radiogroup",
              name: "workload",
              title: "Как вы оцениваете свою нагрузку?",
              choices: [
                "Низкая",
                "Оптимальная",
                "Высокая",
                "Чрезмерная"
              ],
              isRequired: true
            },
            {
              type: "boolean",
              name: "overtime",
              title: "Перерабатываете ли вы чаще двух раз в неделю?",
              labelTrue: "Да",
              labelFalse: "Нет"
            },
            {
              type: "comment",
              name: "wish",
              title: "Ваши пожелания"
            }
          ]
        }
      ]
    }
  },
  {
    key: "trn",
    title: "Обратная связь по тренингу",
    description: "Полезность, тренер, формат",
    type: "training",
    definition: {
      title: "Обратная связь: «Информационная безопасность 2026»",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "rating",
              name: "useful",
              title: "Насколько полезным был тренинг?",
              isRequired: true
            },
            {
              type: "rating",
              name: "trainer",
              title: "Оцените работу тренера",
              rateType: "stars"
            },
            {
              type: "radiogroup",
              name: "format",
              title: "Какой формат вам удобнее?",
              choices: [
                "Онлайн",
                "Офлайн",
                "Смешанный"
              ]
            },
            {
              type: "comment",
              name: "note",
              title: "Что добавить в программу?"
            }
          ]
        }
      ]
    }
  },
  {
    key: "onb",
    title: "Адаптация — 30 дней",
    description: "Для новичков после первого месяца",
    type: "onboarding",
    definition: {
      title: "Оценка адаптации — 30 дней",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "radiogroup",
              name: "onboarding",
              title: "Как прошла ваша адаптация?",
              choices: [
                "Отлично",
                "Хорошо",
                "Удовлетворительно",
                "Плохо"
              ],
              isRequired: true
            },
            {
              type: "boolean",
              name: "mentor",
              title: "Был ли назначен наставник?",
              labelTrue: "Да",
              labelFalse: "Нет"
            },
            {
              type: "rating",
              name: "clarity",
              title: "Насколько понятны ваши задачи и KPI?"
            },
            {
              type: "comment",
              name: "help",
              title: "Чего не хватило в первый месяц?"
            }
          ]
        }
      ]
    }
  },
  {
    key: "exit",
    title: "Exit-интервью",
    description: "Причины ухода и советы компании",
    type: "exit",
    definition: {
      title: "Exit-интервью",
      description: "Анкета для сотрудников, покидающих компанию.",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "radiogroup",
              name: "reason",
              title: "Основная причина ухода",
              choices: [
                "Зарплата",
                "Карьерный рост",
                "Руководитель",
                "Нагрузка",
                "Переезд",
                "Другое"
              ],
              showOtherItem: true,
              isRequired: true
            },
            {
              type: "rating",
              name: "back",
              title: "Рассмотрели бы вы возвращение в компанию?",
              rateMin: 1,
              rateMax: 10
            },
            {
              type: "comment",
              name: "advice",
              title: "Что бы вы посоветовали изменить?"
            }
          ]
        }
      ]
    }
  },
  {
    key: "party",
    title: "Голосование",
    description: "Выбор даты и программы мероприятия",
    type: "event",
    definition: {
      title: "Новогодний корпоратив 2026",
      description: "Выберите удобную дату и программу.",
      pages: [
        {
          name: "p1",
          elements: [
            {
              type: "radiogroup",
              name: "date",
              title: "Какая дата вам удобнее?",
              choices: [
                "20 декабря (сб)",
                "26 декабря (пт)",
                "27 декабря (сб)"
              ],
              isRequired: true
            },
            {
              type: "checkbox",
              name: "program",
              title: "Что включить в программу?",
              choices: [
                "Караоке",
                "Квиз",
                "Ведущий",
                "Живая музыка",
                "Фотозона"
              ]
            },
            {
              type: "boolean",
              name: "plusone",
              title: "Придёте с парой?",
              labelTrue: "Да",
              labelFalse: "Нет"
            }
          ]
        }
      ]
    }
  }
];
