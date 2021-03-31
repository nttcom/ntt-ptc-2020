import Vue from "vue";
import Router from "vue-router";

import EventDetail from "@/components/EventDetail.vue";
import EventEdit from "./components/EventEdit.vue";
import EventNew from "./components/EventNew.vue";
import EventReservations from "@/components/EventReservations.vue";
import Events from "@/components/Events.vue";
import Forbidden from "@/components/Forbidden.vue";
import Login from "@/components/Login.vue";
import MyPage from "@/components/MyPage.vue";
import NotFound from "@/components/NotFound.vue";
import Reservations from "./components/Reservations.vue";
import Signup from "@/components/Signup.vue";
import TopPage from "@/components/TopPage.vue";

Vue.use(Router);

export default new Router({
  routes: [
    {
      path: "/",
      component: TopPage
    },
    {
      path: "/events",
      component: Events
    },
    {
      path: "/events/new",
      component: EventNew
    },
    {
      path: "/events/:event_id",
      name: "event",
      component: EventDetail
    },
    {
      path: "/events/:event_id/edit",
      name: "event_edit",
      component: EventEdit
    },
    {
      path: "/events/:event_id/reservations",
      name: "event_reservations",
      component: EventReservations
    },
    {
      path: "/login",
      component: Login
    },
    {
      path: "/mypage",
      component: MyPage
    },
    {
      path: "/reservations",
      component: Reservations
    },
    {
      path: "/signup",
      component: Signup
    },
    {
      path: "/403",
      component: Forbidden
    },
    {
      path: "/404",
      component: NotFound
    },
    {
      path: "/*",
      component: NotFound
    }
  ]
});
